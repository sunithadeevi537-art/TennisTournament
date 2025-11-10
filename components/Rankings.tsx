import React from 'react';
// Fix: The 'types.ts' file was a placeholder, causing "is not a module" error.
// The content of 'types.ts' has been updated to include proper exports, resolving this import issue.
import { Player } from '../types';
import Card from './Card';

interface RankingsProps {
  players: Player[];
}

const Rankings: React.FC<RankingsProps> = ({ players }) => {
  // Sort players by rating in descending order to determine rank
  const sortedPlayers = [...players].sort((a, b) => b.rating - a.rating);

  return (
    <Card>
      <h2 className="text-2xl font-bold mb-4">Current Rankings</h2>
      {sortedPlayers.length === 0 ? (
        <p className="text-gray-600">No players to rank yet.</p>
      ) : (
        <table className="min-w-full bg-white">
          <thead>
            <tr>
              <th className="py-2 px-4 border-b-2 text-left text-gray-600 font-semibold">Rank</th>
              <th className="py-2 px-4 border-b-2 text-left text-gray-600 font-semibold">Player</th>
              <th className="py-2 px-4 border-b-2 text-left text-gray-600 font-semibold">Category</th> {/* Changed from Rating */}
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((player, index) => (
              <tr key={player.id} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                <td className="py-2 px-4 border-b">{index + 1}</td>
                <td className="py-2 px-4 border-b flex items-center">
                  {player.imageUrl && (
                    <img src={player.imageUrl} alt={player.name} className="w-8 h-8 rounded-full mr-2 object-cover" />
                  )}
                  {player.name}
                </td>
                <td className="py-2 px-4 border-b">{player.category}</td> {/* Changed from player.rating */}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
};

export default Rankings;