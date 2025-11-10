// Fix: Replaced placeholder "full contents of components/TournamentSetup.tsx" with actual component code.
import React, { useState, useEffect, useRef } from 'react';
import { Player, TournamentSettings, TournamentType, MatchFormat, CsvMatch } from '../types';
import Button from './Button';
import Card from './Card';
import FileUpload from './FileUpload'; // New import for custom fixture upload
import html2canvas from 'html2canvas'; // New import for PNG export
import { PLAYER_CATEGORIES, MATCH_FORMATS, TOURNAMENT_TYPES, DEFAULT_TOURNAMENT_TYPE, DEFAULT_MIN_PLAYERS_PER_HYBRID_GROUP } from '../constants'; // Import categories and match formats

interface TournamentSetupProps {
  players: Player[];
  tournamentSettings: TournamentSettings | null;
  onStartTournament: (settings: TournamentSettings) => void; // Used for Knockout
  onResetTournament: () => void;
  isAdminMode: boolean;
  currentRound: number;
  // Tournament Type & Match Format
  selectedTournamentType: TournamentType;
  onTournamentTypeChange: (type: TournamentType) => void;
  selectedMatchFormat: MatchFormat;
  onMatchFormatChange: (format: MatchFormat) => void;
  // New props for Round Robin fixture generation
  generatedFixtures: Record<string, { player1: string; player2: string; category?: string; group?: string; }[]>;
  isGeneratingFixture: Record<string, boolean>;
  onGenerateCategoryFixture: (category: string, group?: string) => void;
  onDownloadFixture: (fixtureData: { player1: string; player2: string; category?: string; group?: string; }[], category: string) => void;
  onAddFixtureMatchesToTournament: (category: string, fixture: { player1: string; player2: string; category?: string; group?: string; }[]) => void;
  isFixtureActiveForCategory: (category: string) => boolean;
  onStartRoundRobinTournament: () => void; // New prop to start overall RR tournament
  onGeneratePngFixture: (targetElementId: string, filename: string) => void; // For PNG export

  // New props for Hybrid tournament setup
  minPlayersPerHybridGroup: number;
  onMinPlayersPerHybridGroupChange: (minPlayers: number) => void;
  generatedHybridGroups: Record<string, Player[][]>;
  isGeneratingHybridGroups: Record<string, boolean>;
  onGenerateHybridFixtures: (category: string) => void;
  onUploadCustomFixture: (file: File) => void; // For custom fixture upload
  // Fix: Renamed the prop to match the usage in App.tsx
  onAddHybridFixtureMatchesToTournamentProp: (fixture: CsvMatch[]) => void;
  onPublishFixture: (categoryKey: string) => void; // New prop: to publish fixture
  isFixturePublished: (categoryKey: string) => boolean; // New prop: check if fixture is published
}

const TournamentSetup: React.FC<TournamentSetupProps> = ({
  players,
  tournamentSettings: initialTournamentSettings,
  onStartTournament,
  onResetTournament,
  isAdminMode,
  currentRound,
  selectedTournamentType,
  onTournamentTypeChange,
  selectedMatchFormat,
  onMatchFormatChange,
  generatedFixtures,
  isGeneratingFixture,
  onGenerateCategoryFixture,
  onDownloadFixture,
  onAddFixtureMatchesToTournament,
  isFixtureActiveForCategory,
  onStartRoundRobinTournament,
  onGeneratePngFixture,
  minPlayersPerHybridGroup,
  onMinPlayersPerHybridGroupChange,
  generatedHybridGroups,
  isGeneratingHybridGroups,
  onGenerateHybridFixtures,
  onUploadCustomFixture,
  onAddHybridFixtureMatchesToTournamentProp, // Renamed to avoid conflict
  onPublishFixture, // New
  isFixturePublished, // New
}) => {
  const [tournamentName, setTournamentName] = useState(initialTournamentSettings?.tournamentName || '');
  const [numRounds, setNumRounds] = useState(initialTournamentSettings?.numRounds || 3);
  const [selectedPlayersForKnockout, setSelectedPlayersForKnockout] = useState<string[]>(initialTournamentSettings?.selectedPlayerIds || []);
  const [selectedFixtureCategory, setSelectedFixtureCategory] = useState<string>(PLAYER_CATEGORIES[0] || ''); // For RR fixture generation
  const [showPlayerSelection, setShowPlayerSelection] = useState(false); // For Knockout only

  // Effect to sync tournament settings when they change externally
  useEffect(() => {
    if (initialTournamentSettings) {
      setTournamentName(initialTournamentSettings.tournamentName);
      setNumRounds(initialTournamentSettings.numRounds);
      setSelectedPlayersForKnockout(initialTournamentSettings.selectedPlayerIds);
    }
  }, [initialTournamentSettings]);

  // Effect to auto-select a category if none is selected or if selected category has no players
  useEffect(() => {
    const categoriesWithPlayers = PLAYER_CATEGORIES.filter(category =>
      players.some(player => player.category === category)
    );
    if (categoriesWithPlayers.length > 0 && !categoriesWithPlayers.includes(selectedFixtureCategory)) {
      setSelectedFixtureCategory(categoriesWithPlayers[0]);
    } else if (categoriesWithPlayers.length === 0) {
      setSelectedFixtureCategory(''); // Clear if no players in any category
    }
  }, [players, selectedFixtureCategory]);


  const handlePlayerToggle = (playerId: string) => {
    setSelectedPlayersForKnockout((prev) =>
      prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId],
    );
  };

  const handleStartKnockoutTournament = () => {
    if (selectedPlayersForKnockout.length < 2) {
      alert('Please select at least two players for the knockout tournament.');
      return;
    }
    onStartTournament({
      tournamentName,
      numRounds,
      selectedPlayerIds: selectedPlayersForKnockout,
      matchFormat: MatchFormat.Knockout,
      tournamentType: selectedTournamentType,
    });
  };

  const isTournamentStarted = currentRound > 0;
  const anyFixtureActive = Object.values(isGeneratingFixture).some(Boolean) || currentRound > 0 || Object.values(isGeneratingHybridGroups).some(Boolean);

  if (!isAdminMode) {
    return (
      <Card className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Tournament Setup (Admin Only)</h2>
        <p className="text-gray-600">Please log in as an administrator to configure the tournament.</p>
      </Card>
    );
  }

  // Filter out categories that have no players
  const categoriesWithPlayers = PLAYER_CATEGORIES.filter(category =>
    players.some(player => player.category === category)
  );

  const canStartRoundRobinTournament = categoriesWithPlayers.some(isFixtureActiveForCategory);

  // Helper to render fixture table with dynamic ID for PNG capture
  const renderFixtureTable = (fixture: { player1: string; player2: string; category?: string; group?: string; }[], elementId: string, categoryName?: string, groupName?: string) => (
    <div id={elementId} className="max-h-60 overflow-y-auto border rounded-md bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th className="py-2 px-3 border-b-2 text-left text-gray-600 font-semibold">Match #</th>
            <th className="py-2 px-3 border-b-2 text-left text-gray-600 font-semibold">Player 1</th>
            <th className="py-2 px-3 border-b-2 text-left text-gray-600 font-semibold">Player 2</th>
            {categoryName && <th className="py-2 px-3 border-b-2 text-left text-gray-600 font-semibold">Category</th>}
            {groupName && <th className="py-2 px-3 border-b-2 text-left text-gray-600 font-semibold">Group</th>}
          </tr>
        </thead>
        <tbody>
          {fixture.map((match, index) => (
            <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
              <td className="py-2 px-3 border-b">{index + 1}</td>
              <td className="py-2 px-3 border-b">{match.player1}</td>
              <td className="py-2 px-3 border-b">{match.player2}</td>
              {categoryName && <td className="py-2 px-3 border-b">{match.category || categoryName}</td>}
              {groupName && <td className="py-2 px-3 border-b">{match.group || groupName}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <Card className="mb-6">
      <h2 className="text-2xl font-bold mb-4">Tournament Setup</h2>
      <div className="space-y-4">
        <div>
          <label htmlFor="tournamentName" className="block text-gray-700 font-bold mb-2">
            Tournament Name
          </label>
          <input
            type="text"
            id="tournamentName"
            value={tournamentName}
            onChange={(e) => setTournamentName(e.target.value)}
            className="px-3 py-2 border rounded-md w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isTournamentStarted}
            required
          />
        </div>
        {/* New: Tournament Type Selection */}
        <div>
          <label htmlFor="tournamentType" className="block text-gray-700 font-bold mb-2">
            Tournament Type
          </label>
          <select
            id="tournamentType"
            value={selectedTournamentType}
            onChange={(e) => onTournamentTypeChange(e.target.value as TournamentType)}
            className="px-3 py-2 border rounded-md w-full focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize"
            disabled={isTournamentStarted}
          >
            {TOURNAMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="numRounds" className="block text-gray-700 font-bold mb-2">
            Number of Rounds
          </label>
          <input
            type="number"
            id="numRounds"
            min="1"
            value={numRounds}
            onChange={(e) => setNumRounds(parseInt(e.target.value, 10))}
            className="px-3 py-2 border rounded-md w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isTournamentStarted}
            required
          />
        </div>

        {/* Match Format Selection */}
        <div>
          <label className="block text-gray-700 font-bold mb-2">Match Format</label>
          <div className="flex space-x-4">
            {MATCH_FORMATS.map((format) => (
              <label key={format} className="inline-flex items-center">
                <input
                  type="radio"
                  className="form-radio"
                  name="matchFormat"
                  value={format}
                  checked={selectedMatchFormat === format}
                  onChange={() => onMatchFormatChange(format)}
                  disabled={isTournamentStarted}
                />
                <span className="ml-2 capitalize">{format.replace('-', ' ')}</span>
              </label>
            ))}
          </div>
        </div>

        {selectedMatchFormat === MatchFormat.Knockout && (
          <div className="border p-4 rounded-md bg-blue-50">
            <h3 className="text-xl font-semibold mb-3">Knockout Tournament Setup</h3>
            <Button
              variant="secondary"
              onClick={() => setShowPlayerSelection(!showPlayerSelection)}
              className="w-full mb-2"
              disabled={isTournamentStarted}
            >
              {showPlayerSelection ? 'Hide Player Selection' : 'Select Players for Tournament'} ({selectedPlayersForKnockout.length} selected)
            </Button>

            {showPlayerSelection && (
              <div className="border p-4 rounded-md mt-2 max-h-60 overflow-y-auto bg-gray-50">
                <h4 className="font-semibold mb-2">Available Players:</h4>
                {players.length === 0 ? (
                  <p className="text-gray-600">No players registered yet. Add players first!</p>
                ) : (
                  <div className="space-y-2">
                    {PLAYER_CATEGORIES.map(category => (
                      <div key={category}>
                        <h5 className="font-bold text-blue-700">{category} Category</h5>
                        {players.filter(p => p.category === category).length === 0 ? (
                          <p className="text-gray-500 text-sm italic">No players in this category.</p>
                        ) : (
                          players
                            .filter(p => p.category === category)
                            .map((player) => (
                              <div key={player.id} className="flex items-center">
                                <input
                                  type="checkbox"
                                  id={`player-${player.id}`}
                                  checked={selectedPlayersForKnockout.includes(player.id)}
                                  onChange={() => handlePlayerToggle(player.id)}
                                  className="mr-2"
                                  disabled={isTournamentStarted}
                                />
                                <label htmlFor={`player-${player.id}`}>{player.name}</label>
                              </div>
                            ))
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex space-x-2 mt-4">
              <Button
                onClick={handleStartKnockoutTournament}
                disabled={isTournamentStarted || selectedPlayersForKnockout.length < 2 || !tournamentName}
                className="flex-1"
              >
                {isTournamentStarted ? 'Tournament Started' : 'Generate Knockout Matches'}
              </Button>
            </div>
          </div>
        )}

        {selectedMatchFormat === MatchFormat.RoundRobin && (
          <div className="border p-4 rounded-md bg-green-50">
            <h3 className="text-xl font-semibold mb-3">Round Robin Fixture Generation (Per Category)</h3>
            <div className="flex flex-col md:flex-row md:items-center space-y-2 md:space-y-0 md:space-x-4 mb-4">
              <label htmlFor="fixtureCategory" className="font-semibold">Select Category:</label>
              <select
                id="fixtureCategory"
                value={selectedFixtureCategory}
                onChange={(e) => setSelectedFixtureCategory(e.target.value)}
                className="px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 flex-1"
                disabled={isTournamentStarted || categoriesWithPlayers.length === 0}
              >
                {categoriesWithPlayers.length === 0 ? (
                  <option value="">No players in any category</option>
                ) : (
                  categoriesWithPlayers.map((category) => (
                    <option key={category} value={category}>
                      {category} ({players.filter(p => p.category === category).length} players)
                    </option>
                  ))
                )}
              </select>
              <Button
                onClick={() => onGenerateCategoryFixture(selectedFixtureCategory)}
                disabled={isGeneratingFixture[selectedFixtureCategory] || isTournamentStarted || !selectedFixtureCategory || players.filter(p => p.category === selectedFixtureCategory).length < 2}
                className="whitespace-nowrap"
              >
                {isGeneratingFixture[selectedFixtureCategory] ? 'Generating...' : 'Generate Fixture'}
              </Button>
            </div>

            {isGeneratingFixture[selectedFixtureCategory] && (
              <p className="text-green-700 animate-pulse mt-2">Generating round-robin fixture for {selectedFixtureCategory}...</p>
            )}

            {generatedFixtures[selectedFixtureCategory] && generatedFixtures[selectedFixtureCategory].length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold mb-2">Generated Fixture for {selectedFixtureCategory} ({generatedFixtures[selectedFixtureCategory].length} matches):</h4>
                {renderFixtureTable(generatedFixtures[selectedFixtureCategory], `rr-fixture-table-${selectedFixtureCategory}`, selectedFixtureCategory)}
                <div className="flex space-x-2 mt-4">
                  <Button
                    onClick={() => onDownloadFixture(generatedFixtures[selectedFixtureCategory], selectedFixtureCategory)}
                    disabled={isTournamentStarted}
                    variant="secondary"
                  >
                    Download Fixture (CSV)
                  </Button>
                  <Button
                    onClick={() => onGeneratePngFixture(`rr-fixture-table-${selectedFixtureCategory}`, `round_robin_fixture_${selectedFixtureCategory.replace(/\s+/g, '_')}.png`)}
                    disabled={isTournamentStarted}
                    variant="secondary"
                  >
                    Download Fixture (PNG)
                  </Button>
                  <Button
                    onClick={() => onAddFixtureMatchesToTournament(selectedFixtureCategory, generatedFixtures[selectedFixtureCategory])}
                    disabled={isTournamentStarted || isFixtureActiveForCategory(selectedFixtureCategory)}
                    className="flex-1"
                  >
                    {isFixtureActiveForCategory(selectedFixtureCategory) ? `Fixture for ${selectedFixtureCategory} Added` : `Add Fixture Matches to Tournament (${selectedFixtureCategory})`}
                  </Button>
                  <Button
                    onClick={() => onPublishFixture(selectedFixtureCategory)}
                    disabled={isTournamentStarted || isFixturePublished(selectedFixtureCategory)}
                    variant="secondary"
                  >
                    {isFixturePublished(selectedFixtureCategory) ? 'Published' : 'Publish Fixture'}
                  </Button>
                </div>
              </div>
            )}
            <div className="mt-6 pt-4 border-t-2 border-green-200">
              <h4 className="text-xl font-semibold mb-3">Overall Round Robin Tournament Control</h4>
              <p className="text-sm text-gray-600 mb-2">
                After adding fixtures for desired categories, click "Start Tournament" to begin Round 1.
              </p>
              <Button
                onClick={onStartRoundRobinTournament}
                disabled={isTournamentStarted || !canStartRoundRobinTournament}
                className="w-full"
              >
                {isTournamentStarted ? 'Tournament Started' : 'Start Round Robin Tournament'}
              </Button>
            </div>
          </div>
        )}

        {selectedMatchFormat === MatchFormat.Hybrid && (
          <div className="border p-4 rounded-md bg-purple-50">
            <h3 className="text-xl font-semibold mb-3">Hybrid Tournament Setup (Round Robin then Knockout)</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="minPlayersPerGroup" className="block text-gray-700 font-bold mb-2">
                  Min Players per Group (League Stage)
                </label>
                <input
                  type="number"
                  id="minPlayersPerGroup"
                  min="3" // Minimum 3 players for RR within a group
                  value={minPlayersPerHybridGroup}
                  onChange={(e) => onMinPlayersPerHybridGroupChange(parseInt(e.target.value, 10) || DEFAULT_MIN_PLAYERS_PER_HYBRID_GROUP)}
                  className="px-3 py-2 border rounded-md w-full focus:outline-none focus:ring-2 focus:ring-purple-500"
                  disabled={isTournamentStarted}
                  required
                />
                <p className="text-sm text-gray-600 mt-1">If more than 8 players in a category, they will be divided into groups of at least this size for the initial Round Robin stage.</p>
              </div>

              <div className="flex flex-col md:flex-row md:items-center space-y-2 md:space-y-0 md:space-x-4">
                <label htmlFor="hybridFixtureCategory" className="font-semibold">Select Category:</label>
                <select
                  id="hybridFixtureCategory"
                  value={selectedFixtureCategory}
                  onChange={(e) => setSelectedFixtureCategory(e.target.value)}
                  className="px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 flex-1"
                  disabled={isTournamentStarted || categoriesWithPlayers.length === 0}
                >
                  {categoriesWithPlayers.length === 0 ? (
                    <option value="">No players in any category</option>
                  ) : (
                    categoriesWithPlayers.map((category) => (
                      <option key={category} value={category}>
                        {category} ({players.filter(p => p.category === category).length} players)
                      </option>
                    ))
                  )}
                </select>
                <Button
                  onClick={() => onGenerateHybridFixtures(selectedFixtureCategory)}
                  disabled={isGeneratingHybridGroups[selectedFixtureCategory] || isTournamentStarted || !selectedFixtureCategory || players.filter(p => p.category === selectedFixtureCategory).length < minPlayersPerHybridGroup}
                  className="whitespace-nowrap"
                >
                  {isGeneratingHybridGroups[selectedFixtureCategory] ? 'Generating...' : 'Generate Hybrid Fixtures (Groups & RR)'}
                </Button>
              </div>

              {isGeneratingHybridGroups[selectedFixtureCategory] && (
                <p className="text-purple-700 animate-pulse mt-2">Generating groups and fixtures for {selectedFixtureCategory}...</p>
              )}

              {generatedHybridGroups[selectedFixtureCategory] && generatedHybridGroups[selectedFixtureCategory].length > 0 && (
                <div className="mt-4">
                  <h4 className="font-semibold mb-2">Generated Groups for {selectedFixtureCategory}:</h4>
                  {generatedHybridGroups[selectedFixtureCategory].map((group, groupIndex) => {
                    const groupKey = `${selectedFixtureCategory}-Group-${groupIndex + 1}`;
                    const groupFixture = generatedFixtures[groupKey];
                    const isGroupFixturePublished = isFixturePublished(groupKey);

                    return (
                      <div key={groupIndex} className="mb-4 p-3 border rounded-md bg-white">
                        <h5 className="font-bold text-lg mb-2">Group {groupIndex + 1} ({group.length} players)</h5>
                        <p>Players: {group.map(p => p.name).join(', ')}</p>
                        {groupFixture && groupFixture.length > 0 && (
                          <>
                            <h6 className="font-semibold mt-2 mb-1">Round Robin Fixture:</h6>
                            {renderFixtureTable(groupFixture, `hybrid-fixture-table-${groupKey}`, selectedFixtureCategory, `Group ${groupIndex + 1}`)}
                            <div className="flex space-x-2 mt-2">
                              <Button
                                onClick={() => onDownloadFixture(groupFixture, groupKey)}
                                disabled={isTournamentStarted}
                                variant="secondary"
                                className="text-sm"
                              >
                                Download Group {groupIndex + 1} Fixture (CSV)
                              </Button>
                              <Button
                                onClick={() => onGeneratePngFixture(`hybrid-fixture-table-${groupKey}`, `hybrid_fixture_${selectedFixtureCategory.replace(/\s+/g, '_')}_group_${groupIndex + 1}.png`)}
                                disabled={isTournamentStarted}
                                variant="secondary"
                                className="text-sm"
                              >
                                Download Group {groupIndex + 1} Fixture (PNG)
                              </Button>
                              <Button
                                onClick={() => onPublishFixture(groupKey)}
                                disabled={isTournamentStarted || isGroupFixturePublished}
                                variant="secondary"
                                className="text-sm"
                              >
                                {isGroupFixturePublished ? 'Published' : 'Publish Group Fixture'}
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 border-t pt-4">
                <h4 className="text-xl font-semibold mb-3">Upload Custom Fixture</h4>
                <FileUpload
                  onFileSelect={onUploadCustomFixture}
                  acceptedFileTypes=".csv"
                  buttonText="Upload Custom Fixture (CSV)"
                  className="w-full"
                  isDisabled={isTournamentStarted}
                />
                <p className="text-sm text-gray-500 mt-2">
                  Upload a CSV file with columns: <code>player1,player2,round,category,group</code>. Round, category and group are optional but recommended for hybrid.
                </p>
                <div className="flex space-x-2 mt-4">
                  {/* Fix: Use the renamed prop `onAddHybridFixtureMatchesToTournamentProp` */}
                  <Button
                    onClick={() => onAddHybridFixtureMatchesToTournamentProp(generatedFixtures['customUploaded'] as CsvMatch[])}
                    disabled={isTournamentStarted || !generatedFixtures['customUploaded']}
                    className="flex-1"
                  >
                    Add Hybrid Fixture Matches to Tournament
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex space-x-2 mt-4">
          <Button
            variant="danger"
            onClick={onResetTournament}
            disabled={!isTournamentStarted && !anyFixtureActive}
            className="flex-1"
          >
            Reset Tournament
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default TournamentSetup;