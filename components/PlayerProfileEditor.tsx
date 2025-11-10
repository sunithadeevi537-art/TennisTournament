import React, { useState, useEffect } from 'react';
// Fix: The 'types.ts' file was a placeholder, causing "is not a module" error.
// The content of 'types.ts' has been updated to include proper exports, resolving this import issue.
import { Player } from '../types';
import Button from './Button';
import Card from './Card';
import FileUpload from './FileUpload';
import { PLAYER_CATEGORIES } from '../constants'; // Import categories

interface PlayerProfileEditorProps {
  player: Player | null; // Null if no player is being edited (e.g., initial state)
  onSave: (updatedPlayer: Player) => void;
  onCancel: () => void;
}

const PlayerProfileEditor: React.FC<PlayerProfileEditorProps> = ({ player, onSave, onCancel }) => {
  const [editedPlayer, setEditedPlayer] = useState<Player | null>(null);

  useEffect(() => {
    setEditedPlayer(player);
  }, [player]);

  if (!editedPlayer) {
    return null; // Don't render if no player is being edited
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setEditedPlayer((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        [name]: type === 'number' ? parseInt(value, 10) || 0 : value,
      };
    });
  };

  const handleImageSelect = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setEditedPlayer((prev) => {
        if (!prev) return null;
        return { ...prev, imageUrl: reader.result as string };
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setEditedPlayer((prev) => {
      if (!prev) return null;
      const { imageUrl, ...rest } = prev; // Remove imageUrl property
      return { ...rest, imageUrl: undefined }; // Explicitly set to undefined
    });
  };


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editedPlayer) {
      onSave(editedPlayer);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <Card className="relative w-full max-w-lg">
        <h2 className="text-2xl font-bold mb-4 text-center">Edit Player Profile</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-gray-700 font-bold mb-2">Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={editedPlayer.name}
              onChange={handleChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              required
            />
          </div>
          <div>
            <label htmlFor="mobileNumber" className="block text-gray-700 font-bold mb-2">Mobile Number</label>
            <input
              type="tel"
              id="mobileNumber"
              name="mobileNumber"
              value={editedPlayer.mobileNumber}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline bg-gray-100"
              disabled // Make read-only
            />
          </div>
          <div>
            <label htmlFor="category" className="block text-gray-700 font-bold mb-2">Category</label>
            <select
              id="category"
              name="category"
              value={editedPlayer.category}
              onChange={handleChange}
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
          <div>
            <label htmlFor="rating" className="block text-gray-700 font-bold mb-2">Rating</label>
            <input
              type="number"
              id="rating"
              name="rating"
              value={editedPlayer.rating}
              onChange={handleChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              min="0"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="wins" className="block text-gray-700 font-bold mb-2">Wins</label>
              <input
                type="number"
                id="wins"
                name="wins"
                value={editedPlayer.wins}
                onChange={handleChange}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                min="0"
              />
            </div>
            <div>
              <label htmlFor="losses" className="block text-gray-700 font-bold mb-2">Losses</label>
              <input
                type="number"
                id="losses"
                name="losses"
                value={editedPlayer.losses}
                onChange={handleChange}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                min="0"
              />
            </div>
            <div>
              <label htmlFor="draws" className="block text-gray-700 font-bold mb-2">Draws</label>
              <input
                type="number"
                id="draws"
                name="draws"
                value={editedPlayer.draws}
                onChange={handleChange}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                min="0"
              />
            </div>
          </div>
          <div>
            <label className="block text-gray-700 font-bold mb-2">Profile Image</label>
            <div className="flex items-center space-x-4">
              {editedPlayer.imageUrl && (
                <img src={editedPlayer.imageUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover border" />
              )}
              <FileUpload
                onFileSelect={handleImageSelect}
                acceptedFileTypes="image/*"
                buttonText={editedPlayer.imageUrl ? "Change Image" : "Upload Image"}
              />
              {editedPlayer.imageUrl && (
                <Button variant="danger" onClick={handleRemoveImage} className="ml-auto">
                  Remove Image
                </Button>
              )}
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Changes
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default PlayerProfileEditor;