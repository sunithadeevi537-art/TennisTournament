
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse'; // Switched to PapaParse
import html2canvas from 'html2canvas';

import Header from './components/Header';
import PlayerList from './components/PlayerList';
import TournamentSetup from './components/TournamentSetup';
import MatchSchedule from './components/MatchSchedule';
import Rankings from './components/Rankings';
import QRScanner from './components/QRScanner';
import LoginModal from './components/LoginModal';
import {
  Player,
  Match,
  TournamentState,
  TournamentSettings,
  TournamentType,
  MatchFormat,
  CsvPlayer,
  CsvMatch
} from './types';
import {
  TOURNAMENT_APP_STORAGE_KEY,
  DEFAULT_PLAYER_CATEGORY,
  DEFAULT_TOURNAMENT_TYPE,
  DEFAULT_MIN_PLAYERS_PER_HYBRID_GROUP,
  PLAYER_CATEGORIES
} from './constants';
import {
  generateRoundSummary,
  generatePlayerQRData,
  generateCategoryFixtureWithGemini,
  generateHybridGroupsWithGemini,
  generateKnockoutBracketWithGemini
} from './services/geminiService';
import Button from './components/Button';
import Card from './components/Card';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password';

const App: React.FC = () => {
  const [state, setState] = useState<TournamentState>(() => {
    const savedState = localStorage.getItem(TOURNAMENT_APP_STORAGE_KEY);
    if (savedState) {
      try {
        const parsedState: TournamentState = JSON.parse(savedState);
        // Ensure that new fields are initialized if not present in saved state
        return {
          ...parsedState,
          generatedFixtures: parsedState.generatedFixtures || {},
          isGeneratingFixture: parsedState.isGeneratingFixture || {},
          generatedHybridGroups: parsedState.generatedHybridGroups || {},
          isGeneratingHybridGroups: parsedState.isGeneratingHybridGroups || {},
          publishedFixtures: parsedState.publishedFixtures || {}, // New: Initialize publishedFixtures
          isBulkUploadingPlayers: parsedState.isBulkUploadingPlayers || false, // New: Initialize bulk upload state
          currentMode: parsedState.currentMode || 'user',
        };
      } catch (e) {
        console.error("Failed to parse stored state, starting fresh:", e);
      }
    }
    return {
      players: [],
      matches: [],
      currentRound: 0,
      tournamentSettings: null,
      roundSummaries: {},
      isAdminLoggedIn: false,
      currentMode: 'user', // Default to user mode
      activeFixtureCategories: [],
      generatedFixtures: {},
      isGeneratingFixture: {},
      generatedHybridGroups: {},
      isGeneratingHybridGroups: {},
      publishedFixtures: {}, // New: Default empty
      isBulkUploadingPlayers: false, // New: Default false
    };
  });

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [selectedTournamentType, setSelectedTournamentType] = useState<TournamentType>(state.tournamentSettings?.tournamentType || DEFAULT_TOURNAMENT_TYPE);
  const [selectedMatchFormat, setSelectedMatchFormat] = useState<MatchFormat>(state.tournamentSettings?.matchFormat || MatchFormat.Knockout);
  const [minPlayersPerHybridGroup, setMinPlayersPerHybridGroup] = useState<number>(state.tournamentSettings?.minPlayersPerHybridGroup || DEFAULT_MIN_PLAYERS_PER_HYBRID_GROUP);
  const [scanPurpose, setScanPurpose] = useState<'player_add_qr' | 'player_identify' | null>(null);

  useEffect(() => {
    localStorage.setItem(TOURNAMENT_APP_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const handleLoginSuccess = () => {
    setState((prevState) => ({ ...prevState, isAdminLoggedIn: true, currentMode: 'admin' }));
    setShowLoginModal(false);
  };

  const handleLogout = () => {
    setState((prevState) => ({ ...prevState, isAdminLoggedIn: false, currentMode: 'user' }));
  };

  const handleModeChange = (mode: 'admin' | 'user') => {
    setState((prevState) => ({ ...prevState, currentMode: mode })); // Always set the mode
    if (mode === 'admin' && !state.isAdminLoggedIn) {
      setShowLoginModal(true);
    }
  };

  const addPlayer = (name: string, mobileNumber: string, category: string, imageUrl?: string) => {
    const newPlayer: Player = {
      id: uuidv4(),
      name,
      mobileNumber,
      rating: 1500, // Default rating
      wins: 0,
      losses: 0,
      draws: 0,
      category,
      imageUrl,
    };
    // Generate QR data for the new player
    newPlayer.qrData = generatePlayerQRData(newPlayer);
    setState((prevState) => ({ ...prevState, players: [...prevState.players, newPlayer] }));
  };

  const deletePlayer = (id: string) => {
    setState((prevState) => ({
      ...prevState,
      players: prevState.players.filter((player) => player.id !== id),
      // Remove matches involving the deleted player
      matches: prevState.matches.filter(
        (match) => match.player1Id !== id && match.player2Id !== id,
      ),
      // Remove any generated fixtures or groups that might have included this player
      generatedFixtures: Object.entries(prevState.generatedFixtures).reduce((acc, [cat, fixture]) => {
        const typedFixture = fixture as Array<{ player1: string; player2: string; category?: string; group?: string; }>;
        const filteredFixture = typedFixture.filter(
          (m) =>
            prevState.players.find(p => p.id === id)?.name !== m.player1 &&
            prevState.players.find(p => p.id === id)?.name !== m.player2
        );
        if (filteredFixture.length > 0) {
          acc[cat] = filteredFixture;
        }
        return acc;
      }, {} as Record<string, { player1: string; player2: string; category?: string; group?: string; }[]>),
      generatedHybridGroups: Object.entries(prevState.generatedHybridGroups).reduce((acc, [cat, groups]) => {
        const typedGroups = groups as Player[][];
        // Filter out the player from groups
        const filteredGroups = typedGroups.map(group =>
          group.filter(p => p.id !== id)
        ).filter(group => group.length > 0); // Remove empty groups
        if (filteredGroups.length > 0) {
          acc[cat] = filteredGroups;
        }
        return acc;
      }, {} as Record<string, Player[][]>)
    }));
  };

  const updatePlayer = (updatedPlayer: Player) => {
    setState((prevState) => ({
      ...prevState,
      players: prevState.players.map((player) =>
        player.id === updatedPlayer.id ? { ...updatedPlayer, qrData: generatePlayerQRData(updatedPlayer) } : player,
      ),
    }));
  };

  const bulkUploadPlayers = useCallback((file: File) => {
    console.log("bulkUploadPlayers: Function invoked with file:", file);

    // Set loading state immediately
    setState((prevState) => ({ ...prevState, isBulkUploadingPlayers: true }));

    try {
      Papa.parse(file, {
        header: true, // Expect a header row
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase(), // Normalize headers
        complete: (results) => {
          console.log("CSV Parse Complete. Meta Fields:", results.meta.fields);
          console.log("CSV Parsed Data (raw):", results.data);

          const newPlayers: Player[] = [];
          const processingErrors: string[] = []; // Renamed for clarity

          if (!Array.isArray(results.data)) {
            processingErrors.push("CSV data could not be parsed as an array. Please check file format.");
            console.error("PapaParse results.data is not an array:", results.data);
            alert(`Error processing CSV: ${processingErrors.join('\n')}`);
            setState((prevState) => ({ ...prevState, isBulkUploadingPlayers: false }));
            return;
          }

          results.data.forEach((data: any, index) => {
            const rowNum = index + 2; // Account for 0-indexed data and header row
            // Ensure mandatory fields exist after header transform
            const name = data.name?.trim();
            const mobileNumber = data.mobilenumber?.trim(); // 'mobilenumber' because of transformHeader
            const rating = data.rating ? parseInt(data.rating, 10) : 1500;
            let category = data.category?.trim();

            if (!name) {
              processingErrors.push(`Row ${rowNum}: Player Name is missing.`);
              return;
            }
            if (!mobileNumber) {
              processingErrors.push(`Row ${rowNum}: Mobile Number is missing.`);
              return;
            }

            // Flexible category matching
            let matchedCategory = PLAYER_CATEGORIES.find(cat => cat.toLowerCase() === (category || '').toLowerCase());
            if (!matchedCategory && category) {
              // Try matching numeric part, e.g., "30" to "30+"
              const numericCat = parseInt(category, 10);
              if (!isNaN(numericCat)) {
                matchedCategory = PLAYER_CATEGORIES.find(cat => cat === `${numericCat}+`);
              }
            }

            if (!matchedCategory) {
              processingErrors.push(`Row ${rowNum}: Invalid category '${category || ''}'. Defaulting to '${DEFAULT_PLAYER_CATEGORY}'. Valid categories: ${PLAYER_CATEGORIES.join(', ')}.`);
              category = DEFAULT_PLAYER_CATEGORY; // Default if not found
            } else {
              category = matchedCategory;
            }

            const player: Player = {
              id: uuidv4(),
              name,
              mobileNumber,
              rating,
              wins: 0,
              losses: 0,
              draws: 0,
              category,
            };
            player.qrData = generatePlayerQRData(player); // Generate QR data
            newPlayers.push(player);
          });

          console.log("New Players Constructed (before state update):", newPlayers);
          console.log("Errors during CSV processing (before state update):", processingErrors);

          if (newPlayers.length > 0) {
            setState((prevState) => {
              // Filter out players that might have the same mobileNumber & category combination
              const existingPlayers = new Set(prevState.players.map(p => `${p.mobileNumber}-${p.category}`));
              const playersToAdd = newPlayers.filter(p => !existingPlayers.has(`${p.mobileNumber}-${p.category}`));

              if (playersToAdd.length < newPlayers.length) {
                processingErrors.push(`${newPlayers.length - playersToAdd.length} players were skipped due to duplicate mobile number/category combinations.`);
              }

              console.log("Players actually being added to state:", playersToAdd);
              const updatedPlayers = [...prevState.players, ...playersToAdd];
              console.log("App state updated with new players. Total players:", updatedPlayers.length, updatedPlayers);
              return {
                ...prevState,
                players: updatedPlayers,
              };
            });
            if (processingErrors.length > 0) {
              alert(`Successfully added ${newPlayers.length - processingErrors.length} players. Some players were skipped:\n\n${processingErrors.join('\n')}`);
            } else {
              alert(`Successfully added ${newPlayers.length} players.`);
            }
          } else if (processingErrors.length > 0) {
            alert(`No players were added due to the following errors:\n\n${processingErrors.join('\n')}`);
          } else {
            alert("CSV processed, but no valid players were found. Please check your file format and data (e.g., all names/mobile numbers were empty).");
          }
          setState((prevState) => ({ ...prevState, isBulkUploadingPlayers: false })); // Reset loading state
        },
        error: (err: any) => {
          console.error("PapaParse Error:", err);
          alert(`Error processing CSV file: ${err.message || 'Unknown error'}`);
          setState((prevState) => ({ ...prevState, isBulkUploadingPlayers: false })); // Reset loading state
        },
        beforeFirstChunk: (chunk: string) => {
          // This is a workaround for files potentially having a BOM (Byte Order Mark)
          // which can interfere with parsing.
          if (chunk.charCodeAt(0) === 0xFEFF) {
            return chunk.substr(1);
          }
          return chunk;
        },
        skipUnmatchedHeaders: true, // Only process defined headers
      });
    } catch (e: any) {
      console.error("Synchronous error during Papa.parse invocation:", e);
      alert(`Unexpected error while preparing CSV parser: ${e.message || 'Unknown error'}`);
      setState((prevState) => ({ ...prevState, isBulkUploadingPlayers: false })); // Reset loading state
    }
  }, [setState]);


  const updateMatchScore = (matchId: string, score1: number, score2: number) => {
    setState((prevState) => {
      const updatedMatches = prevState.matches.map((match) => {
        if (match.id === matchId) {
          const newMatch = { ...match, score1, score2 };
          // Determine winner if scores are final
          if (newMatch.score1 !== null && newMatch.score2 !== null) {
            if (newMatch.score1 > newMatch.score2) {
              newMatch.winnerId = newMatch.player1Id;
            } else if (newMatch.score2 > newMatch.score1) {
              newMatch.winnerId = newMatch.player2Id;
            } else {
              newMatch.winnerId = null; // Draw
            }
            newMatch.isComplete = true;
          }
          return newMatch;
        }
        return match;
      });
      return { ...prevState, matches: updatedMatches };
    });
  };

  const calculateEloRating = (
    playerRating: number,
    opponentRating: number,
    outcome: 'win' | 'loss' | 'draw',
  ): number => {
    const K = 32; // Elo K-factor
    const Ra = playerRating;
    const Rb = opponentRating;

    const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400)); // Expected score for player A

    let Sa: number; // Actual score for player A
    if (outcome === 'win') Sa = 1;
    else if (outcome === 'loss') Sa = 0;
    else Sa = 0.5;

    return Ra + K * (Sa - Ea);
  };

  // Fix: Move useMemo definitions before useCallback if they are dependencies
  const isRoundComplete = useMemo(() => {
    return state.matches.filter(m => m.round === state.currentRound).every(m => m.isComplete);
  }, [state.matches, state.currentRound]);

  const isTournamentCompleted = useMemo(() => {
    if (!state.tournamentSettings || state.currentRound === 0) return false;

    // Check if all active matches for the current round (and possibly previous) are complete
    const allMatchesCompleted = state.matches.filter(m => m.round <= state.currentRound).every(m => m.isComplete);
    if (!allMatchesCompleted) return false;

    if (state.tournamentSettings.matchFormat === MatchFormat.Knockout) {
      // In Knockout, tournament is complete if the number of winners is 1 (final winner decided)
      // or if all rounds are completed and no more matches can be made.
      const currentRoundWinners = new Set(state.matches.filter(m => m.round === state.currentRound && m.winnerId).map(m => m.winnerId));
      // If there's 1 winner, tournament is definitely done (implies previous round was final)
      return currentRoundWinners.size <= 1 && allMatchesCompleted;
    } else if (state.tournamentSettings.matchFormat === MatchFormat.RoundRobin) {
      // For Round Robin, if all initial RR matches are complete, the tournament is done.
      // Assuming all RR matches are in Round 1 for simplicity here.
      return allMatchesCompleted;
    } else if (state.tournamentSettings.matchFormat === MatchFormat.Hybrid) {
      // Hybrid: RR stage complete, then knockout starts. If knockout winners are <= 1, tournament is complete.
      // This will be true when `completeRound` sets `isTournamentCompleted` at the end of knockout stage.
      return allMatchesCompleted && state.currentRound > 1; // Assuming round 1 is RR, subsequent are knockout
    }
    return false;
  }, [state.matches, state.currentRound, state.tournamentSettings]);


  const completeRound = useCallback(async () => {
    if (!state.tournamentSettings) {
      alert("Tournament settings are not defined.");
      return;
    }

    const currentRoundMatches = state.matches.filter((m) => m.round === state.currentRound);

    if (currentRoundMatches.some((m) => !m.isComplete)) {
      alert('Please complete all matches in the current round before proceeding.');
      return;
    }

    // 1. Update player stats (wins, losses, draws, rating)
    setState((prevState) => {
      const updatedPlayers = [...prevState.players];
      const playerMap = new Map<string, Player>(updatedPlayers.map((p) => [p.id, { ...p }]));

      currentRoundMatches.forEach((match) => {
        const player1 = playerMap.get(match.player1Id);
        const player2 = playerMap.get(match.player2Id);

        if (!player1 || !player2) return; // Should not happen

        let outcome1: 'win' | 'loss' | 'draw';
        let outcome2: 'win' | 'loss' | 'draw';

        if (match.winnerId === player1.id) {
          player1.wins += 1;
          player2.losses += 1;
          outcome1 = 'win';
          outcome2 = 'loss';
        } else if (match.winnerId === player2.id) {
          player1.losses += 1;
          player2.wins += 1;
          outcome1 = 'loss';
          outcome2 = 'win';
        } else {
          // Draw
          player1.draws += 1;
          player2.draws += 1;
          outcome1 = 'draw';
          outcome2 = 'draw';
        }

        // Update Elo ratings
        player1.rating = calculateEloRating(player1.rating, player2.rating, outcome1);
        player2.rating = calculateEloRating(player2.rating, player1.rating, outcome2);

        playerMap.set(player1.id, player1);
        playerMap.set(player2.id, player2);
      });

      return { ...prevState, players: Array.from(playerMap.values()) };
    });

    // 2. Generate Round Summary
    setState((prevState) => ({ ...prevState, isLoadingSummary: true }));
    try {
      const summary = await generateRoundSummary(state.players, state.matches, state.currentRound);
      setState((prevState) => ({
        ...prevState,
        roundSummaries: { ...prevState.roundSummaries, [prevState.currentRound]: summary },
      }));
    } catch (error) {
      console.error("Failed to generate round summary:", error);
      alert("Failed to generate AI round summary. Check console for details.");
    } finally {
      setState((prevState) => ({ ...prevState, isLoadingSummary: false }));
    }

    // 3. Generate matches for the next round based on tournament format
    let nextRoundMatches: Match[] = [];
    let isCurrentTournamentCompleted = false; // Use a local variable here

    if (state.tournamentSettings.matchFormat === MatchFormat.Knockout) {
      // Logic for Knockout: Top players from current round progress
      const winners = state.players.filter(
        (p) =>
          currentRoundMatches.some((m) => m.winnerId === p.id)
      ).sort((a, b) => b.rating - a.rating); // Sort winners by rating

      if (winners.length < 2) {
        isCurrentTournamentCompleted = true; // Tournament ends if less than 2 winners
      } else {
        // Generate next round pairings from winners
        const numNextRoundMatches = Math.floor(winners.length / 2);
        for (let i = 0; i < numNextRoundMatches; i++) {
          const player1 = winners[i];
          const player2 = winners[winners.length - 1 - i]; // Simple pairing for now
          if (player1 && player2 && player1.id !== player2.id) {
            nextRoundMatches.push({
              id: uuidv4(),
              player1Id: player1.id,
              player2Id: player2.id,
              score1: null,
              score2: null,
              winnerId: null,
              round: state.currentRound + 1,
              isComplete: false,
              category: player1.category, // Carry over category
            });
          }
        }
        isCurrentTournamentCompleted = winners.length <= 2; // If only 2 winners, it's the final. If 1, winner already decided.
      }


    } else if (state.tournamentSettings.matchFormat === MatchFormat.RoundRobin) {
      // For Round Robin, all matches are typically in Round 1. Subsequent 'rounds' are just for result updates.
      // The tournament is considered complete once all initial matches are played.
      isCurrentTournamentCompleted = true; // All matches were in round 1 for a simple RR
    } else if (state.tournamentSettings.matchFormat === MatchFormat.Hybrid) {
      // Hybrid logic: Identify top 2 from each group, then generate knockout bracket
      // This is assumed to be the transition from RR groups to knockout rounds (e.g., after round 1)
      const isGroupStage = state.currentRound === 1; // Assuming RR group stage is round 1
      if (isGroupStage) {
        const playersInTournament = state.players.filter(p => state.matches.some(m => m.player1Id === p.id || m.player2Id === p.id));
        const groupedPlayers: Record<string, Record<string, Player[]>> = {}; // category -> group -> players

        // Group players based on matches played in current round
        currentRoundMatches.forEach(match => {
          [match.player1Id, match.player2Id].forEach(pId => {
            const player = playersInTournament.find(p => p.id === pId);
            if (player && match.category && match.group) {
              if (!groupedPlayers[match.category]) groupedPlayers[match.category] = {};
              if (!groupedPlayers[match.category][match.group]) groupedPlayers[match.category][match.group] = [];
              if (!groupedPlayers[match.category][match.group].some(p => p.id === player.id)) {
                groupedPlayers[match.category][match.group].push(player);
              }
            }
          });
        });

        const topQualifiers: Player[] = [];
        const uniqueQualifiers = new Set<string>(); // To prevent duplicate players if they qualify from multiple groups/categories

        for (const category in groupedPlayers) {
          for (const group in groupedPlayers[category]) {
            const playersInGroup = groupedPlayers[category][group];
            // Calculate wins/points for players within this specific group
            const groupStandings = playersInGroup.map(p => {
              const wins = currentRoundMatches.filter(m => m.round === state.currentRound && (m.player1Id === p.id || m.player2Id === p.id) && m.winnerId === p.id && m.category === category && m.group === group).length;
              const draws = currentRoundMatches.filter(m => m.round === state.currentRound && (m.player1Id === p.id || m.player2Id === p.id) && m.winnerId === null && m.isComplete && m.category === category && m.group === group).length;
              const points = (wins * 3) + (draws * 1); // Simple point system: 3 for win, 1 for draw
              return { player: p, wins, draws, points };
            }).sort((a, b) => {
              // Sort by points, then wins, then rating
              if (b.points !== a.points) return b.points - a.points;
              if (b.wins !== a.wins) return b.wins - a.wins;
              return b.player.rating - a.player.rating;
            });

            // Identify top 2 from each group and add to qualifiers if not already added
            groupStandings.slice(0, 2).forEach(s => {
              if (!uniqueQualifiers.has(s.player.id)) {
                topQualifiers.push(s.player);
                uniqueQualifiers.add(s.player.id);
              }
            });
          }
        }

        if (topQualifiers.length > 1) {
          // Generate knockout bracket for top qualifiers
          try {
            // Group qualifiers by category to generate per-category knockout brackets
            const categoryQualifiersMap: Record<string, Player[]> = topQualifiers.reduce((acc, p) => {
              if (!acc[p.category]) acc[p.category] = [];
              acc[p.category].push(p);
              return acc;
            }, {});

            for (const cat in categoryQualifiersMap) {
              const qualifiersInCat = categoryQualifiersMap[cat];
              if (qualifiersInCat.length >= 2) {
                const bracket = await generateKnockoutBracketWithGemini(qualifiersInCat, cat);
                const mappedBracket: Match[] = bracket.map((m: any) => {
                  const p1 = state.players.find(p => p.name === m.player1);
                  const p2 = state.players.find(p => p.name === m.player2);
                  if (p1 && p2) {
                    return {
                      id: uuidv4(),
                      player1Id: p1.id,
                      player2Id: p2.id,
                      score1: null,
                      score2: null,
                      winnerId: null,
                      round: state.currentRound + 1, // Next round for knockout
                      isComplete: false,
                      category: m.category || cat,
                      group: m.group, // Group might not apply in knockout, but include if Gemini sends it
                    } as Match; // Explicitly cast to Match
                  }
                  return null;
                }).filter((m): m is Match => m !== null);
                nextRoundMatches.push(...mappedBracket);
              } else {
                console.warn(`Category ${cat} has less than 2 qualifiers, skipping knockout bracket generation for this category.`);
              }
            }
          } catch (error) {
            console.error("Error generating knockout bracket for hybrid tournament:", error);
            alert("Failed to generate knockout bracket for hybrid tournament.");
          }
          isCurrentTournamentCompleted = nextRoundMatches.length === 0 && topQualifiers.length > 0; // If no matches made but qualifiers exist, something's wrong or it's the end
        } else {
          isCurrentTournamentCompleted = true; // Not enough qualifiers for knockout
        }
      } else {
        // Subsequent knockout rounds in hybrid format
        const winners = state.players.filter(
          (p) =>
            currentRoundMatches.some((m) => m.winnerId === p.id)
        ).sort((a, b) => b.rating - a.rating);

        if (winners.length < 2) {
          isCurrentTournamentCompleted = true;
        } else {
          const numNextRoundMatches = Math.floor(winners.length / 2);
          for (let i = 0; i < numNextRoundMatches; i++) {
            const player1 = winners[i];
            const player2 = winners[winners.length - 1 - i];
            if (player1 && player2 && player1.id !== player2.id) {
              nextRoundMatches.push({
                id: uuidv4(),
                player1Id: player1.id,
                player2Id: player2.id,
                score1: null,
                score2: null,
                winnerId: null,
                round: state.currentRound + 1,
                isComplete: false,
                category: player1.category,
              });
            }
          }
          isCurrentTournamentCompleted = winners.length <= 2;
        }
      }
    }

    setState((prevState) => ({
      ...prevState,
      currentRound: prevState.currentRound + 1,
      matches: [...prevState.matches, ...nextRoundMatches],
      tournamentSettings: prevState.tournamentSettings ? { ...prevState.tournamentSettings, customFixtureUploaded: false } : null, // Reset flag
      // isTournamentCompleted: isCurrentTournamentCompleted, // No, this should be handled by useMemo
    }));
  }, [state.players, state.matches, state.currentRound, state.tournamentSettings, setState]);


  // ---- Tournament Setup Handlers ----
  const handleTournamentTypeChange = useCallback((type: TournamentType) => {
    setSelectedTournamentType(type);
    setState(prevState => ({
      ...prevState,
      tournamentSettings: prevState.tournamentSettings ? { ...prevState.tournamentSettings, tournamentType: type } : null
    }));
  }, [setState]);

  const handleMatchFormatChange = useCallback((format: MatchFormat) => {
    setSelectedMatchFormat(format);
    setState(prevState => ({
      ...prevState,
      tournamentSettings: prevState.tournamentSettings ? { ...prevState.tournamentSettings, matchFormat: format } : null
    }));
  }, [setState]);

  const handleMinPlayersPerHybridGroupChange = useCallback((minPlayers: number) => {
    setMinPlayersPerHybridGroup(minPlayers);
    setState(prevState => ({
      ...prevState,
      tournamentSettings: prevState.tournamentSettings ? { ...prevState.tournamentSettings, minPlayersPerHybridGroup: minPlayers } : null
    }));
  }, [setState]);

  const startTournament = useCallback(
    (settings: TournamentSettings) => {
      if (state.players.length < 2) {
        alert('Not enough players registered to start a tournament.');
        return;
      }

      let initialMatches: Match[] = [];

      if (settings.matchFormat === MatchFormat.Knockout) {
        const selectedPlayers = state.players.filter(p => settings.selectedPlayerIds.includes(p.id));

        if (selectedPlayers.length < 2) {
          alert('Please select at least two players for the knockout tournament.');
          return;
        }

        // Simple pairing for Round 1 of knockout
        const numMatches = Math.floor(selectedPlayers.length / 2);
        for (let i = 0; i < numMatches; i++) {
          const player1 = selectedPlayers[i];
          const player2 = selectedPlayers[selectedPlayers.length - 1 - i]; // Pair first with last, etc.
          if (player1 && player2 && player1.id !== player2.id) {
            initialMatches.push({
              id: uuidv4(),
              player1Id: player1.id,
              player2Id: player2.id,
              score1: null,
              score2: null,
              winnerId: null,
              round: 1,
              isComplete: false,
              category: player1.category, // Carry over category
            });
          }
        }
      } else if (settings.matchFormat === MatchFormat.RoundRobin) {
        // Round Robin tournament is started by activating category fixtures
        // This function would only be called if no fixtures have been added yet, which is not the case for RR
        alert("For Round Robin, add matches for categories first, then click 'Start Round Robin Tournament'.");
        return;
      } else if (settings.matchFormat === MatchFormat.Hybrid) {
        alert("For Hybrid, generate groups & fixtures or upload custom fixture, then click 'Add Hybrid Fixture Matches to Tournament'.");
        return;
      }

      setState((prevState) => ({
        ...prevState,
        tournamentSettings: settings,
        matches: initialMatches,
        currentRound: 1,
        roundSummaries: {},
        activeFixtureCategories: [], // Reset for new tournament
        generatedFixtures: {},
        isGeneratingFixture: {},
        generatedHybridGroups: {},
        isGeneratingHybridGroups: {},
        publishedFixtures: {}, // Reset published fixtures for new tournament
      }));
    },
    [state.players, setState],
  );

  const onStartRoundRobinTournament = useCallback(() => {
    if (!state.tournamentSettings) {
      alert("Please configure tournament settings (name, rounds, type) first.");
      return;
    }
    // Check if any matches are actually present in round 1
    const round1Matches = state.matches.filter(m => m.round === 1);
    if (round1Matches.length === 0) {
      alert("No matches have been added for Round Robin tournament. Please generate and add fixtures for categories first.");
      return;
    }

    setState(prevState => ({
      ...prevState,
      currentRound: 1,
      roundSummaries: {},
    }));
  }, [state.tournamentSettings, state.matches, setState]);


  const handleGenerateCategoryFixture = useCallback(async (category: string, group?: string) => {
    setState(prevState => ({
      ...prevState,
      isGeneratingFixture: { ...prevState.isGeneratingFixture, [category]: true }
    }));
    try {
      if (!process.env.API_KEY) {
        alert("API Key is not configured. Please select your API key to use AI features.");
        return;
      }
      const playersInSelectedCategory = group
        ? (state.generatedHybridGroups[category]?.flat() || []).filter(p => p.group === group) // Filter by group if specified
        : state.players.filter(p => p.category === category); // Filter by category only

      if (playersInSelectedCategory.length < 2) {
        alert(`Need at least 2 players in the '${category}' category${group ? ` (Group: ${group})` : ''} to generate a fixture.`);
        return;
      }
      const fixture = await generateCategoryFixtureWithGemini(playersInSelectedCategory, category, group);

      setState(prevState => ({
        ...prevState,
        generatedFixtures: {
          ...prevState.generatedFixtures,
          // Use a composite key for groups like 'Category-Group-1'
          [group ? `${category}-Group-${group}` : category]: fixture
        }
      }));
    } catch (error) {
      console.error("Error generating category fixture:", error);
      alert("Failed to generate fixture. Please check API key and try again.");
    } finally {
      setState(prevState => ({
        ...prevState,
        isGeneratingFixture: { ...prevState.isGeneratingFixture, [category]: false }
      }));
    }
  }, [state.players, state.generatedHybridGroups, state.isGeneratingFixture, setState]);

  const handleDownloadFixture = useCallback((fixtureData: { player1: string; player2: string; category?: string; group?: string; }[], filenamePrefix: string) => {
    if (fixtureData.length === 0) {
      alert("No fixture data to download.");
      return;
    }
    const csvHeader = ["Player 1", "Player 2", "Category", "Group"].join(',');
    const csvRows = fixtureData.map(match =>
      `"${match.player1}","${match.player2}","${match.category || ''}","${match.group || ''}"`
    ).join('\n');
    const csvContent = `${csvHeader}\n${csvRows}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filenamePrefix.replace(/\s+/g, '_')}_fixture.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, []);

  const handleGeneratePngFixture = useCallback(async (targetElementId: string, filename: string) => {
    const input = document.getElementById(targetElementId);
    if (!input) {
      alert('Fixture table element not found for PNG export. Ensure the table is rendered and visible.');
      return;
    }
    try {
      const canvas = await html2canvas(input);
      const imgData = canvas.toDataURL('image/png');

      const link = document.createElement('a');
      link.href = imgData;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error generating PNG fixture:", error);
      alert("Failed to generate PNG image. Ensure the table is visible and not obstructed.");
    }
  }, []);


  const addCategoryFixtureMatchesToTournament = useCallback((category: string, fixture: { player1: string; player2: string; category?: string; group?: string; }[]) => {
    if (!state.tournamentSettings) {
      alert("Tournament settings are not defined. Cannot add matches.");
      return;
    }

    const newMatches: Match[] = fixture.map(f => {
      const player1 = state.players.find(p => p.name === f.player1);
      const player2 = state.players.find(p => p.name === f.player2);
      if (!player1 || !player2) {
        console.warn(`Skipping fixture match due to unknown player: ${f.player1} vs ${f.player2}`);
        return null;
      }
      return {
        id: uuidv4(),
        player1Id: player1.id,
        player2Id: player2.id,
        score1: null,
        score2: null,
        winnerId: null,
        round: 1, // All initial RR matches are in Round 1
        isComplete: false,
        category: f.category || category, // Ensure category is set
        group: f.group, // Ensure group is set if applicable
      } as Match; // Explicitly cast to Match
    }).filter((m): m is Match => m !== null); // Filter out nulls

    if (newMatches.length === 0) {
      alert("No valid matches could be added from the generated fixture.");
      return;
    }

    setState(prevState => ({
      ...prevState,
      matches: [...prevState.matches, ...newMatches],
      activeFixtureCategories: [...new Set([...prevState.activeFixtureCategories, category])] // Add category to active list
    }));
    alert(`Added ${newMatches.length} matches for ${category} to the tournament.`);

  }, [state.players, state.tournamentSettings, setState]);

  const isFixtureActiveForCategory = useCallback((category: string): boolean => {
    return state.activeFixtureCategories.includes(category) || state.matches.some(m => m.round === 1 && m.category === category);
  }, [state.activeFixtureCategories, state.matches]);

  const handlePublishFixture = useCallback((categoryKey: string) => {
    const fixtureToPublish = state.generatedFixtures[categoryKey];
    if (!fixtureToPublish || fixtureToPublish.length === 0) {
      alert("No fixture generated to publish.");
      return;
    }
    setState(prevState => ({
      ...prevState,
      publishedFixtures: {
        ...prevState.publishedFixtures,
        [categoryKey]: fixtureToPublish
      }
    }));
    alert(`Fixture for ${categoryKey} published to Player Portal.`);
  }, [state.generatedFixtures, setState]);

  const isFixturePublished = useCallback((categoryKey: string): boolean => {
    return !!state.publishedFixtures[categoryKey] && state.publishedFixtures[categoryKey].length > 0;
  }, [state.publishedFixtures]);


  // ---- Hybrid Tournament Handlers ----
  const handleGenerateHybridFixtures = useCallback(async (category: string) => {
    setState(prevState => ({
      ...prevState,
      isGeneratingHybridGroups: { ...prevState.isGeneratingHybridGroups, [category]: true },
      isGeneratingFixture: { ...prevState.isGeneratingFixture, [category]: true } // Also set fixture loading
    }));
    try {
      if (!process.env.API_KEY) {
        alert("API Key is not configured. Please select your API key to use AI features.");
        return;
      }

      const playersInSelectedCategory = state.players.filter(p => p.category === category);

      if (playersInSelectedCategory.length < minPlayersPerHybridGroup) {
        alert(`Need at least ${minPlayersPerHybridGroup} players in the '${category}' category to generate hybrid groups.`);
        return;
      }
      if (playersInSelectedCategory.length < 4 && minPlayersPerHybridGroup < 4) {
        alert(`Warning: For meaningful round-robin, consider at least 4 players per group. Current min is ${minPlayersPerHybridGroup}.`);
      }

      // --- Client-side Grouping Logic ---
      const shuffledPlayers = [...playersInSelectedCategory].sort(() => 0.5 - Math.random()); // Shuffle for fairness
      const numGroups = Math.max(1, Math.floor(shuffledPlayers.length / minPlayersPerHybridGroup));
      let groups: Player[][] = Array.from({ length: numGroups }, () => []);

      // Distribute players as evenly as possible initially
      shuffledPlayers.forEach((player, index) => {
        groups[index % numGroups].push(player);
      });

      // Refine groups to meet minPlayersPerHybridGroup
      let refinedGroups: Player[][] = [];
      let remainingPlayers: Player[] = [];

      groups.forEach(group => {
        if (group.length >= minPlayersPerHybridGroup) {
          refinedGroups.push(group);
        } else {
          remainingPlayers.push(...group);
        }
      });

      // Try to redistribute remaining players
      if (remainingPlayers.length > 0) {
        // First, try to fill up existing small groups (if any, though `refinedGroups` should only have valid size)
        // Then, add to largest groups, or create new groups if a sufficient number of players remain
        if (remainingPlayers.length >= minPlayersPerHybridGroup) {
          refinedGroups.push(remainingPlayers); // Add as one new group if enough players
        } else {
          // If remaining players are too few for a new group, distribute them
          remainingPlayers.forEach(player => {
            if (refinedGroups.length > 0) {
              const smallestRefinedGroup = refinedGroups.sort((a,b) => a.length - b.length)[0];
              smallestRefinedGroup.push(player);
            } else {
              // This case should ideally not happen if playersInSelectedCategory >= minPlayersPerHybridGroup
              refinedGroups.push([player]);
            }
          });
        }
      }

      // Fix: Change const to let to allow reassignment
      let finalGroups = refinedGroups.filter(group => group.length >= minPlayersPerHybridGroup);

      if (finalGroups.length === 0 && playersInSelectedCategory.length > 0) {
        alert(`Warning: Could not form groups of at least ${minPlayersPerHybridGroup} players for category '${category}'. All players will be placed in one group, potentially smaller than min size.`);
        finalGroups = [playersInSelectedCategory]; // As a fallback, put all in one group
      } else if (finalGroups.length < refinedGroups.length) {
        alert(`Warning: Some groups for category '${category}' did not meet the minimum ${minPlayersPerHybridGroup} players and were removed. Only valid groups will proceed.`);
      }

      // --- Gemini for RR Fixture within each group ---
      const generatedGroupFixtures: Record<string, { player1: string; player2: string; category?: string; group?: string; }[]> = {};
      await Promise.all(finalGroups.map(async (group, index) => {
        const groupName = `Group ${index + 1}`;
        if (group.length >= 2) {
          const fixture = await generateCategoryFixtureWithGemini(group, category, groupName);
          generatedGroupFixtures[`${category}-${groupName}`] = fixture;
        } else {
          console.warn(`Group ${groupName} in category ${category} has less than 2 players, skipping fixture generation.`);
        }
      }));

      setState(prevState => ({
        ...prevState,
        generatedHybridGroups: {
          ...prevState.generatedHybridGroups,
          [category]: finalGroups
        },
        generatedFixtures: {
          ...prevState.generatedFixtures,
          ...generatedGroupFixtures
        }
      }));

    } catch (error) {
      console.error("Error generating hybrid groups and fixtures:", error);
      alert("Failed to generate hybrid groups or fixtures. Please check API key and try again.");
    } finally {
      setState(prevState => ({
        ...prevState,
        isGeneratingHybridGroups: { ...prevState.isGeneratingHybridGroups, [category]: false },
        isGeneratingFixture: { ...prevState.isGeneratingFixture, [category]: false }
      }));
    }
  }, [state.players, minPlayersPerHybridGroup, state.isGeneratingHybridGroups, state.isGeneratingFixture, setState, generateCategoryFixtureWithGemini]);


  const handleUploadCustomFixture = useCallback((file: File) => {
    console.log("handleUploadCustomFixture: Function invoked with file:", file);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (results) => {
        console.log("Custom Fixture CSV Parse Complete. Meta Fields:", results.meta.fields);
        console.log("Custom Fixture CSV Parsed Data (raw):", results.data);

        const customMatches: CsvMatch[] = [];
        const processingErrors: string[] = []; // Renamed for clarity

        if (!Array.isArray(results.data)) {
          processingErrors.push("Custom Fixture CSV data could not be parsed as an array. Please check file format.");
          console.error("PapaParse results.data is not an array for custom fixture:", results.data);
          alert(`Error processing Custom Fixture CSV: ${processingErrors.join('\n')}`);
          return;
        }

        results.data.forEach((data: any, index) => {
          const rowNum = index + 2;
          const player1Name = data.player1?.trim();
          const player2Name = data.player2?.trim();
          const round = data.round ? parseInt(data.round, 10) : 1;
          const category = data.category?.trim() || 'default'; // Use 'default' or actual category
          const group = data.group?.trim() || null;

          if (!player1Name || !player2Name) {
            processingErrors.push(`Row ${rowNum}: Player 1 or Player 2 name is missing.`);
            return;
          }

          customMatches.push({
            player1: player1Name,
            player2: player2Name,
            round,
            category,
            group,
          });
        });

        console.log("Custom Matches Constructed:", customMatches);
        console.log("Errors during Custom Fixture CSV processing:", processingErrors);

        if (customMatches.length > 0) {
          setState(prevState => ({
            ...prevState,
            // Store custom matches in a special key or directly process them
            // For now, let's just make it available for the 'Add Hybrid Fixture Matches' button
            generatedFixtures: {
              ...prevState.generatedFixtures,
              'customUploaded': customMatches // Store under a unique key
            },
            tournamentSettings: prevState.tournamentSettings ? { ...prevState.tournamentSettings, customFixtureUploaded: true } : null
          }));
          if (processingErrors.length > 0) {
            alert(`Successfully processed ${customMatches.length - processingErrors.length} custom matches. Some rows were skipped:\n\n${processingErrors.join('\n')}`);
          } else {
            alert(`Successfully processed ${customMatches.length} custom matches. Click 'Add Hybrid Fixture Matches to Tournament' to add them.`);
          }
        } else if (processingErrors.length > 0) {
          alert(`No custom matches were added due to the following errors:\n\n${processingErrors.join('\n')}`);
        } else {
          alert("Custom Fixture CSV processed, but no valid matches were found. Please check your file format and data.");
        }
      },
      error: (err: any) => {
        console.error("PapaParse Error for custom fixture:", err);
        alert(`Error processing Custom Fixture CSV file: ${err.message || 'Unknown error'}`);
      },
      beforeFirstChunk: (chunk: string) => {
        if (chunk.charCodeAt(0) === 0xFEFF) {
          return chunk.substr(1);
        }
        return chunk;
      },
      skipUnmatchedHeaders: true,
    });
  }, [setState]);

  // Fix: Changed the type of fixtureData parameter to CsvMatch[] to correctly include 'round'
  const onAddHybridFixtureMatchesToTournament = useCallback((fixtureData: CsvMatch[]) => {
    if (!state.tournamentSettings) {
      alert("Tournament settings are not defined. Cannot add matches.");
      return;
    }

    const matchesToAdd: Match[] = [];
    const processingErrors: string[] = [];

    // Prioritize customUploaded if present, otherwise use generated
    const sourceFixture: CsvMatch[] = state.tournamentSettings.customFixtureUploaded && state.generatedFixtures['customUploaded']
      ? (state.generatedFixtures['customUploaded'] as CsvMatch[])
      : fixtureData;

    if (!sourceFixture || sourceFixture.length === 0) {
      alert("No fixture data (generated or custom uploaded) to add for hybrid tournament.");
      return;
    }

    sourceFixture.forEach((f, index) => {
      const player1 = state.players.find(p => p.name === f.player1);
      const player2 = state.players.find(p => p.name === f.player2);
      if (!player1 || !player2) {
        processingErrors.push(`Fixture row ${index + 1}: Could not find player(s) for ${f.player1} vs ${f.player2}.`);
        return;
      }
      matchesToAdd.push({
        id: uuidv4(),
        player1Id: player1.id,
        player2Id: player2.id,
        score1: null,
        score2: null,
        winnerId: null,
        round: f.round || 1, // Use round from CSV or default to 1
        isComplete: false,
        category: f.category || player1.category, // Use category from CSV or player's category
        group: f.group, // Use group from CSV
      });
    });

    if (matchesToAdd.length === 0) {
      alert(`No valid matches could be added to the tournament. Errors: ${processingErrors.join('; ')}`);
      return;
    }

    setState(prevState => ({
      ...prevState,
      matches: [...prevState.matches, ...matchesToAdd],
      currentRound: 1, // Start hybrid tournament at Round 1 with these matches
      tournamentSettings: prevState.tournamentSettings ? { ...prevState.tournamentSettings, customFixtureUploaded: true } : null,
      roundSummaries: {},
      activeFixtureCategories: [...new Set([...prevState.activeFixtureCategories, ...(sourceFixture.map(f => f.category || '').filter(Boolean) as string[])])], // Add all categories involved
    }));
    alert(`Added ${matchesToAdd.length} matches for hybrid tournament. ${processingErrors.length > 0 ? `Warnings: ${processingErrors.join('; ')}` : ''}`);

  }, [state.players, state.tournamentSettings, state.generatedFixtures, setState]);


  const resetTournament = useCallback(() => {
    if (window.confirm('Are you sure you want to reset all tournament data? This cannot be undone.')) {
      setState({
        players: [],
        matches: [],
        currentRound: 0,
        tournamentSettings: null,
        roundSummaries: {},
        isAdminLoggedIn: state.isAdminLoggedIn, // Keep login status
        currentMode: 'admin', // Default to admin after reset
        activeFixtureCategories: [],
        generatedFixtures: {},
        isGeneratingFixture: {},
        generatedHybridGroups: {},
        isGeneratingHybridGroups: {},
        publishedFixtures: {}, // Reset published fixtures
        isBulkUploadingPlayers: false, // Reset bulk upload state
      });
      setSelectedTournamentType(DEFAULT_TOURNAMENT_TYPE);
      setSelectedMatchFormat(MatchFormat.Knockout);
      setMinPlayersPerHybridGroup(DEFAULT_MIN_PLAYERS_PER_HYBRID_GROUP);
      alert('All tournament data has been reset.');
    }
  }, [state.isAdminLoggedIn, setState]);

  return (
    <div className="min-h-screen bg-gray-100">
      <Header
        title="New Tournament"
        currentMode={state.currentMode}
        onModeChange={handleModeChange}
        isLoggedIn={state.isAdminLoggedIn}
        onLogout={handleLogout}
      />

      <main className="container mx-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {state.currentMode === 'admin' && (
          <>
            <div className="md:col-span-1 space-y-4">
              <PlayerList
                players={state.players}
                onAddPlayer={addPlayer}
                onDeletePlayer={deletePlayer}
                onUpdatePlayer={updatePlayer}
                onBulkUploadPlayers={bulkUploadPlayers}
                isAdminMode={state.isAdminLoggedIn}
                isBulkUploadingPlayers={state.isBulkUploadingPlayers} // Pass loading state
                onScanPlayerQR={() => {
                  setScanPurpose('player_add_qr');
                  setShowQRScanner(true);
                }}
              />
              {showQRScanner && scanPurpose === 'player_add_qr' && (
                <QRScanner
                  onScan={(qrData) => {
                    try {
                      const { name, mobile } = JSON.parse(qrData);
                      if (name && mobile) {
                        addPlayer(name, mobile, DEFAULT_PLAYER_CATEGORY); // Add with default category for now
                        alert(`Player ${name} (${mobile}) added successfully.`);
                      } else {
                        alert("Invalid QR data for player registration.");
                      }
                    } catch (e) {
                      alert("Failed to parse QR data. Ensure it's a valid player JSON.");
                      console.error("QR scan error:", e);
                    } finally {
                      setShowQRScanner(false);
                      setScanPurpose(null);
                    }
                  }}
                  onClose={() => {
                    setShowQRScanner(false);
                    setScanPurpose(null);
                  }}
                />
              )}
            </div>

            <div className="md:col-span-2 space-y-4">
              <TournamentSetup
                players={state.players}
                tournamentSettings={state.tournamentSettings}
                onStartTournament={startTournament}
                onResetTournament={resetTournament}
                isAdminMode={state.isAdminLoggedIn}
                currentRound={state.currentRound}
                selectedTournamentType={selectedTournamentType}
                onTournamentTypeChange={handleTournamentTypeChange}
                selectedMatchFormat={selectedMatchFormat}
                onMatchFormatChange={handleMatchFormatChange}
                generatedFixtures={state.generatedFixtures}
                isGeneratingFixture={state.isGeneratingFixture}
                onGenerateCategoryFixture={handleGenerateCategoryFixture}
                onDownloadFixture={handleDownloadFixture}
                onAddFixtureMatchesToTournament={addCategoryFixtureMatchesToTournament}
                isFixtureActiveForCategory={isFixtureActiveForCategory}
                onStartRoundRobinTournament={onStartRoundRobinTournament}
                onGeneratePngFixture={handleGeneratePngFixture}
                minPlayersPerHybridGroup={minPlayersPerHybridGroup}
                onMinPlayersPerHybridGroupChange={handleMinPlayersPerHybridGroupChange}
                generatedHybridGroups={state.generatedHybridGroups}
                isGeneratingHybridGroups={state.isGeneratingHybridGroups}
                onGenerateHybridFixtures={handleGenerateHybridFixtures}
                onUploadCustomFixture={handleUploadCustomFixture}
                onAddHybridFixtureMatchesToTournament={onAddHybridFixtureMatchesToTournament}
                onPublishFixture={handlePublishFixture} // Pass new callback
                isFixturePublished={isFixturePublished} // Pass new utility
              />

              {state.currentRound > 0 && (
                <MatchSchedule
                  matches={state.matches}
                  players={state.players}
                  currentRound={state.currentRound}
                  onUpdateMatchScore={updateMatchScore}
                  onCompleteRound={completeRound}
                  isRoundComplete={isRoundComplete}
                  isTournamentCompleted={isTournamentCompleted}
                  roundSummary={state.roundSummaries[state.currentRound]}
                  isLoadingSummary={state.isLoadingSummary}
                  isAdminMode={state.isAdminLoggedIn}
                />
              )}

              <Rankings players={state.players} />
            </div>
          </>
        )}

        {state.currentMode === 'user' && (
          <>
            <div className="md:col-span-1 space-y-4">
              <PlayerList
                players={state.players}
                onAddPlayer={addPlayer} // Not shown in user mode, but still needed for type safety
                onDeletePlayer={deletePlayer} // Not shown in user mode
                onUpdatePlayer={updatePlayer} // Not shown in user mode
                onBulkUploadPlayers={bulkUploadPlayers} // Not shown in user mode
                isAdminMode={state.isAdminLoggedIn} // Will be false
                isBulkUploadingPlayers={state.isBulkUploadingPlayers}
              />
            </div>
            <div className="md:col-span-2 space-y-4">
              {state.currentRound > 0 ? (
                <MatchSchedule
                  matches={state.matches}
                  players={state.players}
                  currentRound={state.currentRound}
                  onUpdateMatchScore={updateMatchScore} // Disabled in user mode UI
                  onCompleteRound={completeRound} // Disabled in user mode UI
                  isRoundComplete={isRoundComplete}
                  isTournamentCompleted={isTournamentCompleted}
                  roundSummary={state.roundSummaries[state.currentRound]}
                  isLoadingSummary={state.isLoadingSummary}
                  isAdminMode={state.isAdminLoggedIn} // Will be false
                />
              ) : (
                <MatchSchedule
                  matches={[]} // No active matches for currentRound 0
                  players={state.players}
                  currentRound={0} // Indicate pre-tournament state
                  onUpdateMatchScore={() => {}} // No-op
                  onCompleteRound={() => {}} // No-op
                  isRoundComplete={false}
                  isTournamentCompleted={false}
                  isAdminMode={state.isAdminLoggedIn} // Will be false
                  publishedFixtures={state.publishedFixtures} // Display published fixtures
                />
              )}
              <Rankings players={state.players} />
            </div>
          </>
        )}
      </main>

      <LoginModal
        show={showLoginModal}
        onClose={() => {
          setShowLoginModal(false);
          if (!state.isAdminLoggedIn) {
            // Revert to user mode if login is cancelled and not logged in
            handleModeChange('user');
          }
        }}
        onLoginSuccess={handleLoginSuccess}
        validUsername={ADMIN_USERNAME}
        validPassword={ADMIN_PASSWORD}
      />
    </div>
  );
};

export default App;