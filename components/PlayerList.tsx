import React, { useState } from 'react';
import { Player, CsvPlayer } from '../types';
import Button from './Button';
import Card from './Card';
import FileUpload from './FileUpload';
import PlayerProfileEditor from './PlayerProfileEditor'; // Assuming this is for editing individual players
import { PLAYER_CATEGORIES, DEFAULT_PLAYER_CATEGORY } from '../constants';

interface PlayerListProps {
  players: Player[];
  onAddPlayer: (name: string, mobileNumber: string, category: string, imageUrl?: string) => void;
  onDeletePlayer: (id: string) => void;
  onUpdatePlayer: (player: Player) => void;
  onBulkUploadPlayers: (file: File) => void;
  isAdminMode: boolean;
  isBulkUploadingPlayers: boolean;
  // onScanPlayerQR: () => void; // Removed for QR scanner integration
}

const PlayerList: React.FC<PlayerListProps> = ({
  players,
  onAddPlayer,
  onDeletePlayer,
  onUpdatePlayer,
  onBulkUploadPlayers,
  isAdminMode,
  isBulkUploadingPlayers,
  // onScanPlayerQR, // Removed
}) => {
  const [showAddPlayerForm, setShowAddPlayerForm] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerMobile, setNewPlayerMobile] = useState('');
  const [newPlayerCategory, setNewPlayerCategory] = useState(DEFAULT_PLAYER_CATEGORY);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPlayerName && newPlayerMobile && newPlayerCategory) {
      onAddPlayer(newPlayerName, newPlayerMobile, newPlayerCategory);
      setNewPlayerName('');
      setNewPlayerMobile('');
      setNewPlayerCategory(DEFAULT_PLAYER_CATEGORY);
      setShowAddPlayerForm(false);
    } else {
      alert('Please fill in player name and mobile number.');
    }
  };

  const handleEditPlayer = (player: Player) => {
    setEditingPlayer(player);
  };

  const handleSaveEditedPlayer = (updatedPlayer: Player) => {
    onUpdatePlayer(updatedPlayer);
    setEditingPlayer(null);
  };

  const handleCancelEdit = () => {
    setEditingPlayer(null);
  };

  const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Card className="mb-6">
      <h2 className="text-2xl font-bold mb-4">Players</h2>

      {isAdminMode && (
        <div className="mb-4 space-y-2">
          <Button onClick={() => setShowAddPlayerForm(!showAddPlayerForm)} className="w-full">
            {showAddPlayerForm ? 'Hide Add Player Form' : 'Add New Player'}
          </Button>

          {showAddPlayerForm && (
            <form onSubmit={handleAddPlayer} className="border p-4 rounded-md bg-gray-50 space-y-3">
              <h3 className="text-lg font-semibold">New Player Details</h3>
              <div>
                <label htmlFor="playerName" className="block text-gray-700 text-sm font-bold mb-1">Name</label>
                <input
                  type="text"
                  id="playerName"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  required
                />
              </div>
              <div>
                <label htmlFor="playerMobile" className="block text-gray-700 text-sm font-bold mb-1">Mobile Number</label>
                <input
                  type="tel"
                  id="playerMobile"
                  value={newPlayerMobile}
                  onChange={(e) => setNewPlayerMobile(e.target.value)}
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  required
                />
              </div>
              <div>
                <label htmlFor="playerCategory" className="block text-gray-700 text-sm font-bold mb-1">Category</label>
                <select
                  id="playerCategory"
                  value={newPlayerCategory}
                  onChange={(e) => setNewPlayerCategory(e.target.value)}
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  aria-label="Player category"
                >
                  {PLAYER_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="w-full">Add Player</Button>
            </form>
          )}

          <FileUpload
            onFileSelect={onBulkUploadPlayers}
            acceptedFileTypes=".csv"
            buttonText={isBulkUploadingPlayers ? "Uploading Players..." : "Bulk Upload Players (CSV)"}
            isDisabled={isBulkUploadingPlayers}
          />
          <p className="text-sm text-gray-500">
            CSV should have columns: <code>name,mobileNumber,rating,category</code>
          </p>
          {/* <Button onClick={onScanPlayerQR} variant="secondary" className="w-full">
            Scan QR to Register Player
          </Button> */}
        </div>
      )}

      {players.length === 0 ? (
        <p className="text-gray-600">No players registered yet. Use the form above to add some!</p>
      ) : (
        <div className="max-h-96 overflow-y-auto border rounded-md bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="py-2 px-3 border-b-2 text-left text-gray-600 font-semibold">Name</th>
                <th className="py-2 px-3 border-b-2 text-left text-gray-600 font-semibold">Category</th>
                <th className="py-2 px-3 border-b-2 text-left text-gray-600 font-semibold">Rating</th>
                {isAdminMode && <th className="py-2 px-3 border-b-2 text-left text-gray-600 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((player, index) => (
                <tr key={player.id} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                  <td className="py-2 px-3 border-b flex items-center">
                    {player.imageUrl && (
                      <img src={player.imageUrl} alt={player.name} className="w-8 h-8 rounded-full mr-2 object-cover" />
                    )}
                    {player.name}
                  </td>
                  <td className="py-2 px-3 border-b">{player.category}</td>
                  <td className="py-2 px-3 border-b">{Math.round(player.rating)}</td>
                  {isAdminMode && (
                    <td className="py-2 px-3 border-b">
                      <div className="flex space-x-2">
                        <Button
                          variant="secondary"
                          onClick={() => handleEditPlayer(player)}
                          className="px-2 py-1 text-xs"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => onDeletePlayer(player.id)}
                          className="px-2 py-1 text-xs"
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingPlayer && (
        <PlayerProfileEditor
          player={editingPlayer}
          onSave={handleSaveEditedPlayer}
          onCancel={handleCancelEdit}
        />
      )}
    </Card>
  );
};

export default PlayerList;