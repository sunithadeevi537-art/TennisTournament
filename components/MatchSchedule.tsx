
import React from 'react';
// Fix: The 'types.ts' file was a placeholder, causing "is not a module" error.
// The content of 'types.ts' has been updated to include proper exports, resolving this import issue.
import { Match, Player } from '../types'; // Assuming Match and Player types are defined
import Card from './Card';
import Button from './Button';

interface MatchScheduleProps {
  matches: Match[];
  players: Player[]; // To get player names
  currentRound: number;
  onUpdateMatchScore: (matchId: string, score1: number, score2: number) => void;
  onCompleteRound: () => void;
  isRoundComplete: boolean;
  isTournamentCompleted: boolean;
  roundSummary?: string;
  isLoadingSummary?: boolean;
  isAdminMode: boolean; // New prop
  publishedFixtures?: Record<string, { player1: string; player2: string; category?: string; group?: string; }[]>; // New: Optional published fixtures
}

const MatchSchedule: React.FC<MatchScheduleProps> = ({
  matches,
  players,
  currentRound,
  onUpdateMatchScore,
  onCompleteRound,
  isRoundComplete,
  isTournamentCompleted,
  roundSummary,
  isLoadingSummary,
  isAdminMode,
  publishedFixtures, // New prop
}) => {
  const getPlayerName = (id: string) => players.find(p => p.id === id)?.name || `Player ${id}`;

  const handleScoreChange = (matchId: string, playerNum: 1 | 2, value: string) => {
    const score = parseInt(value, 10);
    if (!isNaN(score) && score >= 0) {
      const match = matches.find(m => m.id === matchId);
      if (match) {
        if (playerNum === 1) {
          onUpdateMatchScore(matchId, score, match.score2 || 0);
        } else {
          onUpdateMatchScore(matchId, match.score1 || 0, score);
        }
      }
    }
  };

  const currentRoundMatches = matches.filter(m => m.round === currentRound);

  // Helper to render fixture table (for published fixtures)
  const renderFixtureTable = (fixture: { player1: string; player2: string; category?: string; group?: string; }[], categoryName?: string, groupName?: string) => (
    <div className="max-h-60 overflow-y-auto border rounded-md bg-white">
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


  if (currentRound === 0 && !isAdminMode && publishedFixtures && Object.keys(publishedFixtures).length > 0) {
    return (
      <Card className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Upcoming Fixtures</h2>
        {Object.entries(publishedFixtures).map(([key, fixture]) => {
          const [category, group] = key.split('-Group-');
          return (
            <div key={key} className="mb-4 p-3 border rounded-md bg-gray-50">
              <h3 className="text-lg font-semibold mb-2">
                {group ? `Category: ${category}, Group: ${group}` : `Category: ${category}`}
              </h3>
              {/* Fix: Explicitly cast fixture to the expected type */}
              {renderFixtureTable(fixture as { player1: string; player2: string; category?: string; group?: string; }[], category, group)}
            </div>
          );
        })}
      </Card>
    );
  }


  return (
    <Card className="mb-6">
      <h2 className="text-2xl font-bold mb-4">Round {currentRound} Matches</h2>
      {currentRoundMatches.length === 0 && currentRound > 0 ? (
        <p className="text-gray-600">No matches scheduled for this round yet.</p>
      ) : (
        <div className="space-y-4">
          {currentRoundMatches.map(match => (
            <div key={match.id} className="border p-4 rounded-md bg-gray-50">
              <p className="text-lg font-semibold mb-2">
                {getPlayerName(match.player1Id)} vs {getPlayerName(match.player2Id)}
                {match.category && <span className="text-sm text-gray-500 ml-2">({match.category})</span>}
                {match.group && <span className="text-sm text-gray-500 ml-1">Group: {match.group}</span>}
              </p>
              <div className="flex items-center space-x-4">
                <input
                  type="number"
                  min="0"
                  value={match.score1 ?? ''}
                  onChange={(e) => handleScoreChange(match.id, 1, e.target.value)}
                  placeholder="Score"
                  className="w-24 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={match.isComplete || !isAdminMode} // Disable if not admin or match complete
                />
                <span> - </span>
                <input
                  type="number"
                  min="0"
                  value={match.score2 ?? ''}
                  onChange={(e) => handleScoreChange(match.id, 2, e.target.value)}
                  placeholder="Score"
                  className="w-24 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={match.isComplete || !isAdminMode} // Disable if not admin or match complete
                />
                {match.isComplete && (
                  <span className="text-green-600 font-medium ml-2">
                    Winner: {match.winnerId ? getPlayerName(match.winnerId!) : 'Tied'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isTournamentCompleted && isAdminMode && ( // Only show button if not completed and is admin
        <div className="mt-6 flex justify-end">
          <Button onClick={onCompleteRound} disabled={!isRoundComplete}>
            Complete Round {currentRound}
          </Button>
        </div>
      )}

      {isTournamentCompleted && <p className="text-green-600 font-bold mt-4 text-center">Tournament Completed!</p>}

      {isLoadingSummary && (
        <Card className="mt-6 p-4 bg-blue-50">
          <p className="text-blue-700 animate-pulse">Generating round summary...</p>
        </Card>
      )}
      {roundSummary && (
        <Card className="mt-6 p-4 bg-gray-100">
          <h3 className="text-lg font-semibold mb-2">Round {currentRound} Summary:</h3>
          <p className="text-gray-800 whitespace-pre-wrap">{roundSummary}</p>
        </Card>
      )}
    </Card>
  );
};

export default MatchSchedule;