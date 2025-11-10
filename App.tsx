import React, { useState, useEffect, useCallback, useRef } from 'react';

// A simple ID generator as uuidv4 might require a new NPM dependency, which is disallowed.
// If uuid is available, it's preferred.
// For this context, we will use a simple, non-cryptographic unique ID generator.
let currentId = 0;
function generateUniqueId(): string {
  currentId++;
  return `id_${currentId}_${Date.now()}`;
}

// Components
import Header from './components/Header';
import PlayerList from './components/PlayerList';
import TournamentSetup from './components/TournamentSetup';
import MatchSchedule from './components/MatchSchedule';
import Rankings from './components/Rankings';
import LoginModal from './components/LoginModal';
import QRScanner from './components/QRScanner'; // Assuming QR scanner integration for future
// Fix: Added import for Button component
import Button from './components/Button';

// Types & Constants
import {
  Player,
  Match,
  TournamentState,
  TournamentSettings,
  MatchFormat,
  TournamentType,
  CsvPlayer,
  CsvMatch,
} from './types';
import {
  TOURNAMENT_APP_STORAGE_KEY,
  PLAYER_CATEGORIES,
  DEFAULT_PLAYER_CATEGORY,
  DEFAULT_TOURNAMENT_TYPE,
  MATCH_FORMATS,
  DEFAULT_MIN_PLAYERS_PER_HYBRID_GROUP,
} from './constants';

// Services
import {
  generateRoundSummary,
  generateRoundRobinFixture,
  generateHybridGroupsAndFixtures,
} from './services/geminiService';

// External libraries
import html2canvas from 'html2canvas';
import Papa from 'papaparse'; // Fix: Import PapaParse


// Initial state for the tournament application
const initialState: TournamentState = {
  players: [],
  matches: [],
  currentRound: 0,
  tournamentSettings: null,
  roundSummaries: {},
  isAdminLoggedIn: false,
  currentMode: 'user', // Default to user mode
  activeFixtureCategories: [], // Track categories where fixtures have been added
  generatedFixtures: {}, // Stores generated RR fixtures by category or hybrid group key
  isGeneratingFixture: {}, // Tracks loading state for RR fixture generation
  generatedHybridGroups: {}, // Stores generated groups for hybrid (e.g., category -> array of groups)
  isGeneratingHybridGroups: {}, // Tracks loading state for hybrid group/fixture generation
  publishedFixtures: {}, // Stores fixtures published to player portal
  isBulkUploadingPlayers: false, // New: track loading state for CSV player upload
  // Fix: Initialized isLoadingSummary
  isLoadingSummary: false,
};

const App: React.FC = () => {
  // State management
  const [tournamentState, setTournamentState] = useState<TournamentState>(() => {
    const storedState = localStorage.getItem(TOURNAMENT_APP_STORAGE_KEY);
    if (storedState) {
      try {
        const parsedState: TournamentState = JSON.parse(storedState);
        // Ensure that new fields are initialized if not present in localStorage
        return { ...initialState, ...parsedState };
      } catch (e) {
        console.error("Error parsing stored tournament state, using initial state:", e);
        return initialState;
      }
    }
    return initialState;
  });

  // Destructure for easier access
  const {
    players,
    matches,
    currentRound,
    tournamentSettings,
    roundSummaries,
    isAdminLoggedIn,
    currentMode,
    activeFixtureCategories,
    generatedFixtures,
    isGeneratingFixture,
    generatedHybridGroups,
    isGeneratingHybridGroups,
    publishedFixtures,
    isBulkUploadingPlayers,
  } = tournamentState;

  // Persist state to localStorage on changes
  useEffect(() => {
    localStorage.setItem(TOURNAMENT_APP_STORAGE_KEY, JSON.stringify(tournamentState));
  }, [tournamentState]);

  // Login Modal
  const [showLoginModal, setShowLoginModal] = useState(false);

  const handleLoginSuccess = useCallback(() => {
    setTournamentState((prev) => ({ ...prev, isAdminLoggedIn: true }));
    setShowLoginModal(false);
  }, []);

  const handleLogout = useCallback(() => {
    setTournamentState((prev) => ({ ...prev, isAdminLoggedIn: false }));
  }, []);

  // Mode switching
  const handleModeChange = useCallback((mode: 'admin' | 'user') => {
    if (mode === 'admin' && !isAdminLoggedIn) {
      setShowLoginModal(true);
    } else {
      setTournamentState((prev) => ({ ...prev, currentMode: mode }));
    }
  }, [isAdminLoggedIn]);

  // Player Management
  const handleAddPlayer = useCallback((name: string, mobileNumber: string, category: string, imageUrl?: string) => {
    setTournamentState((prev) => {
      const newPlayer: Player = {
        id: generateUniqueId(),
        name,
        mobileNumber,
        rating: 1500, // Default rating
        wins: 0,
        losses: 0,
        draws: 0,
        category,
        imageUrl,
      };
      return { ...prev, players: [...prev.players, newPlayer] };
    });
  }, []);

  const handleDeletePlayer = useCallback((id: string) => {
    setTournamentState((prev) => {
      // Also clean up any generated/published fixtures that might contain this player
      const updatedGeneratedFixtures: Record<string, CsvMatch[]> = {};
      Object.entries(prev.generatedFixtures).forEach(([key, fixture]) => {
        // Fix: Ensure the filtered fixture maintains the CsvMatch type.
        updatedGeneratedFixtures[key] = fixture.filter(
          (match: CsvMatch) =>
            prev.players.find(p => p.name === match.player1)?.id !== id &&
            prev.players.find(p => p.name === match.player2)?.id !== id
        );
      });

      const updatedPublishedFixtures: Record<string, CsvMatch[]> = {};
      Object.entries(prev.publishedFixtures).forEach(([key, fixture]) => {
        // Fix: Ensure the filtered fixture maintains the CsvMatch type.
        updatedPublishedFixtures[key] = fixture.filter(
          (match: CsvMatch) =>
            prev.players.find(p => p.name === match.player1)?.id !== id &&
            prev.players.find(p => p.name === match.player2)?.id !== id
        );
      });

      // Filter matches containing the deleted player
      const updatedMatches = prev.matches.filter(
        (match) => match.player1Id !== id && match.player2Id !== id
      );

      return {
        ...prev,
        players: prev.players.filter((player) => player.id !== id),
        generatedFixtures: updatedGeneratedFixtures,
        publishedFixtures: updatedPublishedFixtures,
        matches: updatedMatches,
      };
    });
  }, []);

  const handleUpdatePlayer = useCallback((updatedPlayer: Player) => {
    setTournamentState((prev) => ({
      ...prev,
      players: prev.players.map((player) =>
        player.id === updatedPlayer.id ? updatedPlayer : player,
      ),
    }));
  }, []);


  const handleBulkUploadPlayers = useCallback(async (file: File) => {
    setTournamentState(prev => ({ ...prev, isBulkUploadingPlayers: true }));
    // Fix: Declare processingErrors variable
    let processingErrors: string[] = [];
    let playersAddedCount = 0;

    try {
      const text = await file.text();
      if (!text) {
        alert("The uploaded CSV file is empty or could not be read.");
        return;
      }

      console.log('bulkUploadPlayers: Function invoked with file:', file.name);
      console.log('CSV file text content length:', text.length);

      Papa.parse(text, {
        header: true, // Treat first row as headers
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase(), // Normalize headers
        complete: (results) => {
          console.log('CSV Parse Complete. Meta Fields:', results.meta.fields);
          console.log('CSV Parsed Data:', results.data);

          if (!results.data || results.data.length === 0) {
            alert('CSV file processed, but no valid data rows were found.');
            setTournamentState(prev => ({ ...prev, isBulkUploadingPlayers: false }));
            return;
          }

          setTournamentState(prev => {
            const updatedPlayersMap = new Map<string, Player>(prev.players.map(p => [p.mobileNumber, p]));
            let currentPlayersAddedCount = 0;

            results.data.forEach((csvRow: any, index: number) => {
              // Normalize row keys
              const normalizedCsvRow: { [key: string]: string | number | undefined } = {};
              for (const key in csvRow) {
                normalizedCsvRow[key.trim().toLowerCase()] = csvRow[key];
              }

              const name = normalizedCsvRow.name as string;
              const mobileNumber = normalizedCsvRow.mobilenumber as string; // Fix: mobilenumber
              const rating = normalizedCsvRow.rating ? parseInt(normalizedCsvRow.rating as string, 10) : undefined;
              let category = normalizedCsvRow.category as string;
              const imageUrl = normalizedCsvRow.imageurl as string; // Fix: imageUrl

              if (!name || !mobileNumber) {
                processingErrors.push(`Row ${index + 2}: Skipping player due to missing name or mobile number: ${JSON.stringify(normalizedCsvRow)}`);
                return;
              }

              // Flexible category matching (e.g., "30" to "30+")
              if (category && !PLAYER_CATEGORIES.includes(category)) {
                const numericCategory = parseInt(category, 10);
                const matchedCategory = PLAYER_CATEGORIES.find(pc => parseInt(pc, 10) === numericCategory);
                if (matchedCategory) {
                  category = matchedCategory;
                } else {
                  processingErrors.push(`Row ${index + 2}: Unrecognized category '${category}'. Defaulting to '${DEFAULT_PLAYER_CATEGORY}'. Valid categories: ${PLAYER_CATEGORIES.join(', ')}`);
                  category = DEFAULT_PLAYER_CATEGORY;
                }
              } else if (!category) {
                category = DEFAULT_PLAYER_CATEGORY;
              }

              // Check for duplicate mobile number (if exists, update; otherwise, add new)
              if (updatedPlayersMap.has(mobileNumber)) {
                const existingPlayer = updatedPlayersMap.get(mobileNumber)!;
                // Only update if the category is different, or if other details change
                if (existingPlayer.category !== category || existingPlayer.name !== name || existingPlayer.rating !== rating || existingPlayer.imageUrl !== imageUrl) {
                  updatedPlayersMap.set(mobileNumber, {
                    ...existingPlayer,
                    name: name,
                    category: category,
                    rating: rating ?? existingPlayer.rating,
                    imageUrl: imageUrl ?? existingPlayer.imageUrl,
                  });
                }
                // If the exact player (mobileNumber and category) is a duplicate, skip adding
                const isExactDuplicate = prev.players.some(p => p.mobileNumber === mobileNumber && p.category === category);
                if (!isExactDuplicate) {
                    currentPlayersAddedCount++; // Count for updates/new unique category registrations
                }
              } else {
                // New player, or new category for existing mobile number
                const newPlayer: Player = {
                  id: generateUniqueId(),
                  name,
                  mobileNumber,
                  rating: rating ?? 1500,
                  wins: 0,
                  losses: 0,
                  draws: 0,
                  category,
                  imageUrl,
                };
                updatedPlayersMap.set(mobileNumber, newPlayer); // Add to map for subsequent checks
                currentPlayersAddedCount++;
              }
            });

            playersAddedCount = currentPlayersAddedCount;
            const finalPlayers = Array.from(updatedPlayersMap.values());
            console.log('New Players to Add:', finalPlayers);

            let alertMessage = "";
            if (playersAddedCount > 0) {
              alertMessage += `${playersAddedCount} players uploaded/updated successfully!\n`;
            } else {
              alertMessage += "0 players uploaded/updated successfully!\n";
            }
            if (processingErrors.length > 0) {
              alertMessage += `\nWarnings/Errors:\n${processingErrors.join('\n')}`;
              alert(alertMessage); // Show specific errors
            } else if (playersAddedCount > 0) {
              alert(alertMessage); // Only show success if no errors
            } else {
                alert("CSV processed, but no new unique players were added. Check console for details.");
            }

            return { ...prev, players: finalPlayers, isBulkUploadingPlayers: false };
          });
        },
        error: (error) => {
          console.error('PapaParse error:', error);
          alert(`CSV parsing failed: ${error.message}. Please check your CSV file format.`);
          setTournamentState(prev => ({ ...prev, isBulkUploadingPlayers: false }));
        },
      });
    } catch (error) {
      console.error('Error processing bulk player upload:', error);
      alert('Failed to upload players. Check console for details.');
      setTournamentState(prev => ({ ...prev, isBulkUploadingPlayers: false }));
    } finally {
      // isBulkUploadingPlayers is set to false in `complete` or `error` callbacks
      console.log('CSV parsing process finished.');
      console.log('App state updated with new players. Total players:', tournamentState.players.length); // This might be old state
    }
  }, [players]); // Dependency on 'players' to re-create callback if players change


  // Tournament Settings
  const [selectedTournamentType, setSelectedTournamentType] = useState<TournamentType>(
    tournamentSettings?.tournamentType || DEFAULT_TOURNAMENT_TYPE
  );
  const [selectedMatchFormat, setSelectedMatchFormat] = useState<MatchFormat>(
    tournamentSettings?.matchFormat || MatchFormat.Knockout
  );
  const [minPlayersPerHybridGroup, setMinPlayersPerHybridGroup] = useState<number>(
    tournamentSettings?.minPlayersPerHybridGroup || DEFAULT_MIN_PLAYERS_PER_HYBRID_GROUP
  );

  useEffect(() => {
    if (tournamentSettings) {
      setSelectedTournamentType(tournamentSettings.tournamentType);
      setSelectedMatchFormat(tournamentSettings.matchFormat);
      setMinPlayersPerHybridGroup(tournamentSettings.minPlayersPerHybridGroup || DEFAULT_MIN_PLAYERS_PER_HYBRID_GROUP);
    }
  }, [tournamentSettings]);

  const handleTournamentTypeChange = useCallback((type: TournamentType) => {
    setSelectedTournamentType(type);
    setTournamentState(prev => ({
      ...prev,
      tournamentSettings: prev.tournamentSettings
        ? { ...prev.tournamentSettings, tournamentType: type }
        : {
          tournamentName: 'New Tournament',
          numRounds: 3,
          selectedPlayerIds: [],
          matchFormat: MatchFormat.Knockout,
          tournamentType: type,
        }
    }));
  }, []);

  const handleMatchFormatChange = useCallback((format: MatchFormat) => {
    setSelectedMatchFormat(format);
    setTournamentState(prev => ({
      ...prev,
      tournamentSettings: prev.tournamentSettings
        ? { ...prev.tournamentSettings, matchFormat: format }
        : {
          tournamentName: 'New Tournament',
          numRounds: 3,
          selectedPlayerIds: [],
          matchFormat: format,
          tournamentType: selectedTournamentType,
        }
    }));
  }, [selectedTournamentType]);

  const handleMinPlayersPerHybridGroupChange = useCallback((minPlayers: number) => {
    setMinPlayersPerHybridGroup(minPlayers);
    setTournamentState(prev => ({
      ...prev,
      tournamentSettings: prev.tournamentSettings
        ? { ...prev.tournamentSettings, minPlayersPerHybridGroup: minPlayers }
        : {
          tournamentName: 'New Tournament',
          numRounds: 3,
          selectedPlayerIds: [],
          matchFormat: selectedMatchFormat,
          tournamentType: selectedTournamentType,
          minPlayersPerHybridGroup: minPlayers,
        }
    }));
  }, [selectedMatchFormat, selectedTournamentType]);


  // Knockout Tournament Logic
  const generateKnockoutMatchesForRound = useCallback((round: number, previousRoundMatches: Match[]) => {
    const winners = previousRoundMatches
      .filter(m => m.winnerId)
      .map(m => players.find(p => p.id === m.winnerId));

    if (winners.length < 2) {
      return [];
    }

    const shuffledWinners = [...winners].sort(() => 0.5 - Math.random());

    const nextRoundMatches: Match[] = [];
    for (let i = 0; i < shuffledWinners.length; i += 2) {
      if (shuffledWinners[i] && shuffledWinners[i + 1]) { // Ensure both players exist
        nextRoundMatches.push({
          id: generateUniqueId(),
          player1Id: shuffledWinners[i]!.id,
          player2Id: shuffledWinners[i + 1]!.id,
          score1: null,
          score2: null,
          winnerId: null,
          round: round,
          isComplete: false,
          category: shuffledWinners[i]!.category,
        });
      }
    }
    return nextRoundMatches;
  }, [players]);

  const startKnockoutTournament = useCallback((settings: TournamentSettings) => {
    if (settings.selectedPlayerIds.length < 2) {
      alert('Cannot start tournament with fewer than 2 players.');
      return;
    }
    // Check if number of players is a power of 2 for knockout
    if (settings.selectedPlayerIds.length & (settings.selectedPlayerIds.length - 1)) {
      alert('For knockout, number of players should ideally be a power of 2 (e.g., 2, 4, 8, 16).');
      // For simplicity, we can still proceed but it might mean byes or uneven matches.
      // For now, let's keep it as an alert and let the user decide.
    }

    const eligiblePlayers = players.filter(p => settings.selectedPlayerIds.includes(p.id));
    const shuffledPlayers = [...eligiblePlayers].sort(() => 0.5 - Math.random());

    const initialMatches: Match[] = [];
    for (let i = 0; i < shuffledPlayers.length; i += 2) {
      if (shuffledPlayers[i+1]) { // Ensure there are two players for a match
        initialMatches.push({
          id: generateUniqueId(),
          player1Id: shuffledPlayers[i].id,
          player2Id: shuffledPlayers[i + 1].id,
          score1: null,
          score2: null,
          winnerId: null,
          round: 1,
          isComplete: false,
          category: eligiblePlayers[0].category, // Assume one category for simplicity in knockout
        });
      } else {
        // If odd number of players, last player gets a bye. This logic can be enhanced.
        alert(`${shuffledPlayers[i].name} gets a bye in Round 1.`);
      }
    }

    setTournamentState((prev) => ({
      ...prev,
      tournamentSettings: settings,
      matches: initialMatches,
      currentRound: 1,
      activeFixtureCategories: [], // Reset for new tournament type
      generatedFixtures: {},
      generatedHybridGroups: {},
      isGeneratingFixture: {},
      isGeneratingHybridGroups: {},
      publishedFixtures: {},
      roundSummaries: {},
    }));
  }, [players]);


  // Update Match Scores and Player Stats
  const handleUpdateMatchScore = useCallback((matchId: string, score1: number, score2: number) => {
    setTournamentState((prev) => {
      const updatedPlayers = [...prev.players]; // Create a mutable copy of players array
      const player1 = updatedPlayers.find(p => p.id === prev.matches.find(m => m.id === matchId)?.player1Id);
      const player2 = updatedPlayers.find(p => p.id === prev.matches.find(m => m.id === matchId)?.player2Id);

      const updatedMatches = prev.matches.map((match) => {
        if (match.id === matchId) {
          let winnerId: string | null = null;
          let isComplete = false;

          if (score1 !== null && score2 !== null) {
            isComplete = true;
            if (score1 > score2) {
              winnerId = match.player1Id;
            } else if (score2 > score1) {
              winnerId = match.player2Id;
            } else {
              winnerId = null; // A draw
            }
          }

          const oldWinnerId = match.winnerId;
          const oldIsComplete = match.isComplete;

          const newMatch = { ...match, score1, score2, winnerId, isComplete };

          // Update player stats only if match completed or winner changed
          if (isComplete && !oldIsComplete) { // Match just completed
            if (player1 && player2) {
              if (winnerId === player1.id) {
                player1.wins++;
                player2.losses++;
              } else if (winnerId === player2.id) {
                player2.wins++;
                player1.losses++;
              } else { // Draw
                player1.draws++;
                player2.draws++;
              }

              // Simple ELO-like rating adjustment
              const K = 32; // K-factor
              const R1 = player1.rating;
              const R2 = player2.rating;
              const E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400));
              const E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));

              let S1 = 0.5; // Draw
              let S2 = 0.5; // Draw
              if (winnerId === player1.id) { S1 = 1; S2 = 0; }
              else if (winnerId === player2.id) { S1 = 0; S2 = 1; }

              player1.rating = R1 + K * (S1 - E1);
              player2.rating = R2 + K * (S2 - E2);
            }
          } else if (isComplete && oldIsComplete && oldWinnerId !== winnerId) { // Winner changed after completion
            if (player1 && player2) {
              // Revert old stats
              if (oldWinnerId === player1.id) { player1.wins--; player2.losses--; }
              else if (oldWinnerId === player2.id) { player2.wins--; player1.losses--; }
              else { player1.draws--; player2.draws--; } // old was a draw

              // Apply new stats
              if (winnerId === player1.id) { player1.wins++; player2.losses++; }
              else if (winnerId === player2.id) { player2.wins++; player1.losses++; }
              else { player1.draws++; player2.draws++; } // new is a draw

              // Recalculate ELO based on new outcome (simplified, could be more complex with full match history)
              const K = 32;
              const R1 = player1.rating; // Current rating after previous match results
              const R2 = player2.rating;
              const E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400));
              const E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));

              let S1_new = 0.5;
              let S2_new = 0.5;
              if (winnerId === player1.id) { S1_new = 1; S2_new = 0; }
              else if (winnerId === player2.id) { S1_new = 0; S2_new = 1; }

              let S1_old = 0.5;
              let S2_old = 0.5;
              if (oldWinnerId === player1.id) { S1_old = 1; S2_old = 0; }
              else if (oldWinnerId === player2.id) { S1_old = 0; S2_old = 1; }

              // Revert old ELO change and apply new one
              player1.rating = player1.rating - K * (S1_old - E1) + K * (S1_new - E1);
              player2.rating = player2.rating - K * (S2_old - E2) + K * (S2_new - E2);
            }
          }


          return newMatch;
        }
        return match;
      });

      return { ...prev, matches: updatedMatches, players: updatedPlayers };
    });
  }, []);


  // --- Memoized values for round completion ---
  const isCurrentRoundComplete = React.useMemo(() => {
    return matches.filter((m) => m.round === currentRound).every((m) => m.isComplete);
  }, [matches, currentRound]);

  const isTournamentCompleted = React.useMemo(() => {
    if (currentRound === 0) return false;
    if (tournamentSettings?.matchFormat === MatchFormat.Knockout) {
      const previousRoundMatches = matches.filter(m => m.round === currentRound);
      const winnersOfLastRound = previousRoundMatches.filter(m => m.winnerId);
      // Tournament is complete if current round matches are all complete AND
      // there's only one winner from the previous round (or no matches left to generate)
      return isCurrentRoundComplete && winnersOfLastRound.length <= 1;
    } else if (tournamentSettings?.matchFormat === MatchFormat.RoundRobin || tournamentSettings?.matchFormat === MatchFormat.Hybrid) {
      // For RR/Hybrid, assume tournament completed if all initial matches are complete
      // More complex logic for hybrid's knockout stage transition would go here
      return isCurrentRoundComplete && matches.filter(m => m.round === currentRound).length > 0;
    }
    return false;
  }, [matches, currentRound, isCurrentRoundComplete, tournamentSettings?.matchFormat]);


  const handleCompleteRound = useCallback(async () => {
    if (!isCurrentRoundComplete) {
      alert('Please complete all matches in the current round before moving on.');
      return;
    }

    setTournamentState(prev => ({ ...prev, isLoadingSummary: true }));
    try {
      const currentRoundMatches = matches.filter(m => m.round === currentRound);
      const summary = await generateRoundSummary(currentRound, currentRoundMatches.map(m => ({
        player1: players.find(p => p.id === m.player1Id)?.name || m.player1Id,
        player2: players.find(p => p.id === m.player2Id)?.name || m.player2Id,
        round: m.round, // CsvMatch requires round
        category: m.category,
        group: m.group,
      })), players);

      setTournamentState((prev) => {
        let nextMatches: Match[] = [];
        let nextRound = prev.currentRound + 1;
        let tournamentIsCompleted = false; // Renamed to avoid conflict

        const previousRoundMatches = prev.matches.filter(m => m.round === prev.currentRound);

        if (prev.tournamentSettings?.matchFormat === MatchFormat.Knockout) {
          nextMatches = generateKnockoutMatchesForRound(nextRound, previousRoundMatches);
          if (nextMatches.length === 0 && previousRoundMatches.length > 0) {
            tournamentIsCompleted = true; // Last winner determined
            alert("Tournament has a winner!");
          } else if (nextMatches.length === 0 && previousRoundMatches.length === 0 && prev.currentRound === 1) {
             // No matches were generated for round 1 or 0 players, effectively no tournament
             tournamentIsCompleted = true;
          }
        } else if (prev.tournamentSettings?.matchFormat === MatchFormat.RoundRobin) {
          // For Round Robin, typically all matches are in Round 1.
          // If you wanted multiple RR rounds, this logic would need a `generateNextRoundRobinMatches` function.
          // For now, assume RR completes after all Round 1 matches are done.
          tournamentIsCompleted = true;
        } else if (prev.tournamentSettings?.matchFormat === MatchFormat.Hybrid) {
            // HYBRID LOGIC: Transition from Round Robin (group stage) to Knockout
            // Placeholder: This is complex and needs full implementation
            // 1. Identify top N players from each group based on wins/points
            // 2. Generate a knockout bracket from these top players
            alert("Hybrid tournament: Group stage complete. Logic for knockout bracket generation is a placeholder.");
            tournamentIsCompleted = true; // For now, mark as complete after group stage
        }

        return {
          ...prev,
          matches: [...prev.matches, ...nextMatches],
          currentRound: tournamentIsCompleted ? prev.currentRound : nextRound,
          roundSummaries: { ...prev.roundSummaries, [prev.currentRound]: summary },
          // Fix: Use isLoadingSummary from state
          isLoadingSummary: false,
        };
      });
    } catch (error) {
      console.error("Error completing round or generating summary:", error);
      setTournamentState(prev => ({ ...prev, isLoadingSummary: false }));
      alert(`Failed to complete round or generate summary. Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [isCurrentRoundComplete, matches, currentRound, players, generateKnockoutMatchesForRound, tournamentSettings?.matchFormat, tournamentSettings?.numRounds]);


  // Reset Tournament
  const handleResetTournament = useCallback(() => {
    if (window.confirm('Are you sure you want to reset the entire tournament? This cannot be undone.')) {
      setTournamentState(initialState);
      setSelectedTournamentType(DEFAULT_TOURNAMENT_TYPE);
      setSelectedMatchFormat(MatchFormat.Knockout); // Reset to default
      setMinPlayersPerHybridGroup(DEFAULT_MIN_PLAYERS_PER_HYBRID_GROUP);
    }
  }, []);

  // Round Robin Fixture Generation
  const handleGenerateCategoryFixture = useCallback(async (category: string) => {
    setTournamentState(prev => ({
      ...prev,
      isGeneratingFixture: { ...prev.isGeneratingFixture, [category]: true }
    }));
    try {
      if (!process.env.API_KEY) {
        alert("Gemini API Key is not configured. Please select your API key to generate fixtures.");
        return;
      }
      const fixture = await generateRoundRobinFixture(players, category);
      setTournamentState(prev => ({
        ...prev,
        generatedFixtures: { ...prev.generatedFixtures, [category]: fixture }
      }));
    } catch (error) {
      console.error(`Error generating RR fixture for ${category}:`, error);
      alert(`Failed to generate round-robin fixture for ${category}. Ensure players are sufficient. Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTournamentState(prev => ({
        ...prev,
        isGeneratingFixture: { ...prev.isGeneratingFixture, [category]: false }
      }));
    }
  }, [players]);

  const handleDownloadFixture = useCallback((fixtureData: CsvMatch[], filenamePrefix: string) => {
    const csvContent = "data:text/csv;charset=utf-8,"
      + "player1,player2,round,category,group\n"
      + fixtureData.map(e => `${e.player1},${e.player2},${e.round},${e.category || ''},${e.group || ''}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filenamePrefix}_fixture.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleAddFixtureMatchesToTournament = useCallback((category: string, fixture: CsvMatch[]) => {
    setTournamentState(prev => {
      // Ensure all players in the fixture exist
      const playerMap = new Map(prev.players.map(p => [p.name, p.id]));
      const newMatches: Match[] = fixture.map(fMatch => {
        const player1Id = playerMap.get(fMatch.player1);
        const player2Id = playerMap.get(fMatch.player2);

        if (!player1Id || !player2Id) {
          console.warn(`Player not found for match: ${fMatch.player1} vs ${fMatch.player2}. Skipping match.`);
          return null; // Skip this match
        }

        return {
          id: generateUniqueId(),
          player1Id,
          player2Id,
          score1: null,
          score2: null,
          winnerId: null,
          round: fMatch.round || 1, // Default to round 1 if not specified
          isComplete: false,
          category: fMatch.category || category,
          group: fMatch.group,
        };
      }).filter((m: Match | null): m is Match => m !== null) as Match[]; // Fix: Explicitly type the filter callback

      return {
        ...prev,
        matches: [...prev.matches, ...newMatches],
        activeFixtureCategories: [...new Set([...prev.activeFixtureCategories, category])],
        currentRound: prev.currentRound === 0 && newMatches.length > 0 ? 1 : prev.currentRound, // Start round 1 if not already started and matches added
        tournamentSettings: prev.tournamentSettings || { // Create default settings if not existing
          tournamentName: 'Round Robin Tournament',
          numRounds: 1, // Will need to be adjusted for multi-round RR or hybrid
          selectedPlayerIds: Array.from(playerMap.values()),
          matchFormat: selectedMatchFormat,
          tournamentType: selectedTournamentType,
          minPlayersPerHybridGroup: minPlayersPerHybridGroup,
        },
      };
    });
  }, [players, selectedMatchFormat, selectedTournamentType, minPlayersPerHybridGroup]);

  const isFixtureActiveForCategory = useCallback((category: string) => {
    return activeFixtureCategories.includes(category);
  }, [activeFixtureCategories]);

  const handleStartRoundRobinTournament = useCallback(() => {
    if (activeFixtureCategories.length === 0) {
      alert('Please generate and add at least one fixture to the tournament first.');
      return;
    }
    // Check if there are actual matches added from the active fixtures
    const hasMatchesForRound1 = matches.some(m => m.round === 1);
    if (!hasMatchesForRound1) {
        alert('No matches have been added to the tournament. Please add fixtures before starting.');
        return;
    }

    setTournamentState(prev => ({
      ...prev,
      currentRound: 1,
      tournamentSettings: prev.tournamentSettings || {
        tournamentName: 'Round Robin Tournament',
        numRounds: 1, // Placeholder
        selectedPlayerIds: players.map(p => p.id), // All players for RR
        matchFormat: MatchFormat.RoundRobin,
        tournamentType: selectedTournamentType,
      }
    }));
  }, [activeFixtureCategories.length, players, selectedTournamentType, matches]);


  // Hybrid Tournament Logic
  const handleAddHybridFixtureMatchesToTournament = useCallback((fixtureData: CsvMatch[]) => {
    setTournamentState(prev => {
      const playerMap = new Map(prev.players.map(p => [p.name, p.id]));
      const newMatches: Match[] = fixtureData.map(fMatch => {
        const player1Id = playerMap.get(fMatch.player1);
        const player2Id = playerMap.get(fMatch.player2);

        if (!player1Id || !player2Id) {
          console.warn(`Player not found for match: ${fMatch.player1} vs ${fMatch.player2}. Skipping match.`);
          return null;
        }

        return {
          id: generateUniqueId(),
          player1Id,
          player2Id,
          score1: null,
          score2: null,
          winnerId: null,
          round: fMatch.round || 1,
          isComplete: false,
          category: fMatch.category,
          group: fMatch.group,
        };
      }).filter((m: Match | null): m is Match => m !== null) as Match[]; // Fix: Explicitly type the filter callback

      const updatedCategories = new Set(prev.activeFixtureCategories);
      fixtureData.forEach(f => { // Using fixtureData here
        if (f.category) updatedCategories.add(f.category);
        if (f.group) updatedCategories.add(`${f.category || 'unknown'}-${f.group}`); // Add group key as active category
      });

      return {
        ...prev,
        matches: [...prev.matches, ...newMatches],
        activeFixtureCategories: Array.from(updatedCategories),
        currentRound: prev.currentRound === 0 && newMatches.length > 0 ? 1 : prev.currentRound, // Start round 1 if matches added
        tournamentSettings: prev.tournamentSettings || {
          tournamentName: 'Hybrid Tournament',
          numRounds: 1, // Will be dynamically adjusted or set to 1 for initial RR stage
          selectedPlayerIds: Array.from(playerMap.values()),
          matchFormat: MatchFormat.Hybrid,
          tournamentType: selectedTournamentType,
          minPlayersPerHybridGroup: minPlayersPerHybridGroup,
        },
      };
    });
  }, [players, selectedTournamentType, minPlayersPerHybridGroup]);


  const handleGenerateHybridFixtures = useCallback(async (category: string) => {
    setTournamentState(prev => ({
      ...prev,
      isGeneratingHybridGroups: { ...prev.isGeneratingHybridGroups, [category]: true }
    }));
    // Fix: Declare processingErrors variable
    let processingErrors: string[] = [];
    try {
      if (!process.env.API_KEY) {
        alert("Gemini API Key is not configured. Please select your API key to generate hybrid fixtures.");
        return;
      }
      const result = await generateHybridGroupsAndFixtures(players, category, minPlayersPerHybridGroup);
      const groupFixtures: Record<string, CsvMatch[]> = {};
      let generatedGroupsAsPlayers: Player[][] = result.groups; // Already Player objects from service

      // Client-side grouping logic for hybrid to ensure minPlayersPerGroup is met
      const playersInSelectedCategory = players.filter(p => p.category === category);
      if (playersInSelectedCategory.length > 0) { // Only apply if there are players in the category
        const minPlayers = minPlayersPerHybridGroup;
        const numGroups = Math.max(1, Math.floor(playersInSelectedCategory.length / minPlayers));

        // Shuffle players and create groups
        const shuffledCategoryPlayers = [...playersInSelectedCategory].sort(() => 0.5 - Math.random());
        let tempGroups: Player[][] = Array.from({ length: numGroups }, () => []);

        let playerIndex = 0;
        for (let i = 0; i < numGroups; i++) {
          for (let j = 0; j < minPlayers && playerIndex < shuffledCategoryPlayers.length; j++) {
            tempGroups[i].push(shuffledCategoryPlayers[playerIndex++]);
          }
        }
        // Distribute remaining players
        while (playerIndex < shuffledCategoryPlayers.length) {
          tempGroups[playerIndex % numGroups].push(shuffledCategoryPlayers[playerIndex++]);
        }

        // Filter out any groups that might not meet minPlayers if player distribution was uneven or not enough players overall
        generatedGroupsAsPlayers = tempGroups.filter(group => group.length >= minPlayers);
        if (generatedGroupsAsPlayers.length === 0 && playersInSelectedCategory.length >= minPlayers) {
          // If after distribution, no groups meet min, force one group if total players permit
          generatedGroupsAsPlayers = [playersInSelectedCategory];
        } else if (generatedGroupsAsPlayers.length === 0 && playersInSelectedCategory.length < minPlayers) {
          alert(`Not enough players (${playersInSelectedCategory.length}) in ${category} to form groups of ${minPlayers} for Hybrid Tournament.`);
          setTournamentState(prev => ({
            ...prev,
            isGeneratingHybridGroups: { ...prev.isGeneratingHybridGroups, [category]: false }
          }));
          return;
        }
      } else {
        alert(`No players found in category ${category} to generate hybrid fixtures.`);
        setTournamentState(prev => ({
          ...prev,
          isGeneratingHybridGroups: { ...prev.isGeneratingHybridGroups, [category]: false }
        }));
        return;
      }

      // Now use Gemini to generate RR fixtures for these client-side defined groups
      for (const group of generatedGroupsAsPlayers) {
        if (group.length >= 2) {
          const groupName = `Group-${generatedGroupsAsPlayers.indexOf(group) + 1}`;
          try {
            const rrFixtureForGroup = await generateRoundRobinFixture(group, category);
            groupFixtures[`${category}-${groupName}`] = rrFixtureForGroup.map(m => ({ ...m, group: groupName, category: category }));
          } catch (rrError) {
            console.error(`Error generating RR fixture for ${category}, ${groupName}:`, rrError);
            // Fix: Use processingErrors variable
            processingErrors.push(`Failed to generate RR fixture for ${category}, ${groupName}.`);
          }
        } else {
          // Fix: Use processingErrors variable
          processingErrors.push(`Skipping group in ${category} with less than 2 players for RR fixture.`);
        }
      }

      setTournamentState(prev => ({
        ...prev,
        generatedHybridGroups: { ...prev.generatedHybridGroups, [category]: generatedGroupsAsPlayers },
        generatedFixtures: { ...prev.generatedFixtures, ...groupFixtures }, // Add all group fixtures
      }));
       // Fix: Use processingErrors variable
       if (processingErrors.length > 0) {
        alert(`Hybrid fixture generation completed with some warnings/errors:\n${processingErrors.join('\n')}`);
      } else {
        alert(`Hybrid fixtures generated successfully for ${category}!`);
      }
    } catch (error) {
      console.error(`Error generating hybrid groups and fixtures for ${category}:`, error);
      alert(`Failed to generate hybrid groups and fixtures for ${category}. Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTournamentState(prev => ({
        ...prev,
        isGeneratingHybridGroups: { ...prev.isGeneratingHybridGroups, [category]: false }
      }));
    }
  }, [players, minPlayersPerHybridGroup, generateRoundRobinFixture]); // Added generateRoundRobinFixture to dependencies


  const handleUploadCustomFixture = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const customFixture = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase(),
      }).data as CsvMatch[];

      if (customFixture.length === 0) {
        alert('Custom fixture CSV is empty or malformed. Please check the file.');
        return;
      }

      setTournamentState(prev => ({
        ...prev,
        generatedFixtures: {
          ...prev.generatedFixtures,
          'customUploaded': customFixture, // Store it under a specific key
        },
        tournamentSettings: {
          ...(prev.tournamentSettings || {}),
          customFixtureUploaded: true,
          matchFormat: MatchFormat.Hybrid, // Assume custom fixture implies Hybrid or RR
        } as TournamentSettings,
      }));
      // Automatically add to tournament matches after upload
      handleAddHybridFixtureMatchesToTournament(customFixture); // Fix: Call this after setting generatedFixtures
      alert('Custom fixture uploaded and added to tournament matches!');
    } catch (error) {
      console.error('Error uploading custom fixture:', error);
      alert('Failed to upload custom fixture. Ensure it is a valid CSV and check console for details.');
    }
  }, [handleAddHybridFixtureMatchesToTournament]);


  // Publishing Fixtures
  const handlePublishFixture = useCallback((categoryKey: string) => {
    if (generatedFixtures[categoryKey]) {
      setTournamentState(prev => ({
        ...prev,
        publishedFixtures: {
          ...prev.publishedFixtures,
          [categoryKey]: generatedFixtures[categoryKey],
        }
      }));
      alert(`Fixture for ${categoryKey} published to Player Portal!`);
    } else {
      alert(`No fixture found for ${categoryKey} to publish.`);
    }
  }, [generatedFixtures]);

  const isFixturePublished = useCallback((categoryKey: string) => {
    return !!publishedFixtures[categoryKey];
  }, [publishedFixtures]);


  // QR Scanner (Placeholder, not fully integrated into app flow, just component available)
  const [showQRScanner, setShowQRScanner] = useState(false);

  const handleQRScanSuccess = useCallback((data: string) => {
    alert(`QR Scanned: ${data}`);
    setShowQRScanner(false);
    // Here you would parse the QR data and handle player registration or lookup
    // e.g., if QR data is a player's mobile number, you could find them.
  }, []);

  const handleQRScannerClose = useCallback(() => {
    setShowQRScanner(false);
  }, []);


  // PNG Export
  const handleGeneratePngFixture = useCallback(async (targetElementId: string, filename: string) => {
    const input = document.getElementById(targetElementId);
    if (input) {
      try {
        const canvas = await html2canvas(input, {
          scale: 2, // Increase resolution for better quality
          useCORS: true, // If images/resources are from different origins
        });
        const imgData = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = imgData;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        alert('Fixture saved as PNG!');
      } catch (error) {
        console.error('Error generating PNG:', error);
        alert('Failed to generate PNG. Make sure the element is visible and check console for errors.');
      }
    } else {
      alert(`Error: Element with ID '${targetElementId}' not found.`);
    }
  }, []);


  // Render logic

  return (
    <div className="min-h-screen bg-gray-100">
      <Header
        title="Tournament Tracker"
        currentMode={currentMode}
        onModeChange={handleModeChange}
        isLoggedIn={isAdminLoggedIn}
        onLogout={handleLogout}
      />
      <main className="container mx-auto p-4">
        {currentMode === 'admin' && !isAdminLoggedIn && (
          <div className="text-center p-8 bg-white rounded-lg shadow-md mb-6">
            <h2 className="text-xl font-bold mb-4">Admin Portal</h2>
            <p className="text-gray-600 mb-4">Please log in to access admin features.</p>
            <Button onClick={() => setShowLoginModal(true)}>Admin Login</Button>
          </div>
        )}

        {(currentMode === 'user' || isAdminLoggedIn) && (
          <>
            <PlayerList
              players={players}
              onAddPlayer={handleAddPlayer}
              onDeletePlayer={handleDeletePlayer}
              onUpdatePlayer={handleUpdatePlayer}
              onBulkUploadPlayers={handleBulkUploadPlayers}
              isAdminMode={isAdminLoggedIn && currentMode === 'admin'}
              isBulkUploadingPlayers={isBulkUploadingPlayers}
              // onScanPlayerQR={() => setShowQRScanner(true)} // Example of how QR scanner could be used
            />

            {isAdminLoggedIn && currentMode === 'admin' && (
              <TournamentSetup
                players={players}
                tournamentSettings={tournamentSettings}
                onStartTournament={startKnockoutTournament}
                onResetTournament={handleResetTournament}
                isAdminMode={isAdminLoggedIn}
                currentRound={currentRound}
                selectedTournamentType={selectedTournamentType}
                onTournamentTypeChange={handleTournamentTypeChange}
                selectedMatchFormat={selectedMatchFormat}
                onMatchFormatChange={handleMatchFormatChange}
                // Round Robin specific props
                generatedFixtures={generatedFixtures}
                isGeneratingFixture={isGeneratingFixture}
                onGenerateCategoryFixture={handleGenerateCategoryFixture}
                onDownloadFixture={handleDownloadFixture}
                onAddFixtureMatchesToTournament={handleAddFixtureMatchesToTournament}
                isFixtureActiveForCategory={isFixtureActiveForCategory}
                onStartRoundRobinTournament={handleStartRoundRobinTournament}
                onGeneratePngFixture={handleGeneratePngFixture}
                // Hybrid specific props
                minPlayersPerHybridGroup={minPlayersPerHybridGroup}
                onMinPlayersPerHybridGroupChange={handleMinPlayersPerHybridGroupChange}
                generatedHybridGroups={generatedHybridGroups}
                isGeneratingHybridGroups={isGeneratingHybridGroups}
                onGenerateHybridFixtures={handleGenerateHybridFixtures}
                onUploadCustomFixture={handleUploadCustomFixture}
                // Fix: Corrected prop name to match TournamentSetupProps interface
                onAddHybridFixtureMatchesToTournamentProp={handleAddHybridFixtureMatchesToTournament}
                onPublishFixture={handlePublishFixture}
                isFixturePublished={isFixturePublished}
              />
            )}

            <MatchSchedule
              matches={matches}
              players={players}
              currentRound={currentRound}
              onUpdateMatchScore={handleUpdateMatchScore}
              onCompleteRound={handleCompleteRound}
              isRoundComplete={isCurrentRoundComplete}
              isTournamentCompleted={isTournamentCompleted}
              roundSummary={roundSummaries[currentRound]}
              // Fix: Access isLoadingSummary from tournamentState directly
              isLoadingSummary={tournamentState.isLoadingSummary}
              isAdminMode={isAdminLoggedIn && currentMode === 'admin'}
              publishedFixtures={currentMode === 'user' ? publishedFixtures : undefined} // Only show in user mode
            />

            <Rankings players={players} />

            {showLoginModal && (
              <LoginModal
                show={showLoginModal}
                onClose={() => setShowLoginModal(false)}
                onLoginSuccess={handleLoginSuccess}
              />
            )}

            {showQRScanner && (
              <QRScanner
                onScan={handleQRScanSuccess}
                onClose={handleQRScannerClose}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default App;