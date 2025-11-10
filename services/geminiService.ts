import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai"; // Added Type for responseSchema
import { GEMINI_MODEL_TEXT } from "../constants";
// Fix: The 'types.ts' file was a placeholder, causing "is not a module" error.
// The content of 'types.ts' has been updated to include proper exports, resolving this import issue.
import { Player, Match } from "../types";

/**
 * Generates a summary for a tournament round using the Google Gemini API.
 * Always creates a new GoogleGenAI instance right before making an API call
 * to ensure it always uses the most up-to-date API key from the dialog,
 * as per `@google/genai` guidelines.
 *
 * @param players The list of players in the tournament.
 * @param matches The list of all matches, from which current round matches are filtered.
 * @param currentRound The current round number to summarize.
 * @returns A promise that resolves to the generated round summary text.
 */
export async function generateRoundSummary(
  players: Player[],
  matches: Match[],
  currentRound: number,
): Promise<string> {
  // Always use `const ai = new GoogleGenAI({apiKey: process.env.API_KEY});`
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const roundMatches = matches.filter(match => match.round === currentRound);

  const matchDetails = roundMatches.map(match => {
    const player1 = players.find(p => p.id === match.player1Id);
    const player2 = players.find(p => p.id === match.player2Id);
    const winner = match.winnerId ? players.find(p => p.id === match.winnerId) : null;

    return `Match ${match.id}: ${player1?.name} (${match.score1}) vs ${player2?.name} (${match.score2}). Winner: ${winner?.name || 'Draw'}.`;
  }).join('\n');

  const playerRatings = players.map(p => `${p.name} (Rating: ${Math.round(p.rating)}, Wins: ${p.wins}, Losses: ${p.losses}, Draws: ${p.draws}, Category: ${p.category})`).join('\n');

  const prompt = `
  You are an AI assistant for a tournament.
  Please summarize the completed Round ${currentRound} of the tournament based on the following information.
  Identify key highlights, close matches, surprising results, and top performers.
  Also, provide a brief analysis of the current player standings based on their ratings and win/loss/draw records.
  Finally, offer a prediction or interesting insight for the next round or the tournament as a whole.

  Round ${currentRound} Matches:
  ${matchDetails}

  Current Player Standings:
  ${playerRatings}

  Keep the summary concise and engaging, suitable for an announcement to participants.
  Focus on the most impactful events and player performances.
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: [{ text: prompt }], // Ensure contents is an array of parts
    });
    // Extracting text output directly from the response object
    return response.text;
  } catch (error) {
    console.error("Error generating round summary:", error);
    // Implement robust handling for API errors (e.g., 4xx/5xx) and unexpected responses.
    // Graceful retry logic (like exponential backoff) is recommended in a real app.
    // For now, return a default error message.
    return "Failed to generate round summary. Please try again.";
  }
}

/**
 * Generates a JSON string for a player's QR code,
 * containing essential player identification data.
 * @param player The player object.
 * @returns A JSON string representing the player's QR data.
 */
export function generatePlayerQRData(player: Player): string {
  // Encode player ID, mobile number, and category to identify the player uniquely
  return JSON.stringify({ id: player.id, mobile: player.mobileNumber, category: player.category });
}


/**
 * Generates a complete round-robin fixture (all unique pairings) for a given category and optional group of players
 * using the Google Gemini API.
 * @param players The list of players in the specific category/group.
 * @param category The category name for which to generate the fixture.
 * @param group Optional group name within the category.
 * @returns A promise that resolves to an array of objects, each containing player1 and player2 names.
 */
export async function generateCategoryFixtureWithGemini(
  players: Player[],
  category: string,
  group?: string,
): Promise<{ player1: string; player2: string; category: string; group?: string; }[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const playerNames = players.map(p => p.name);
  const groupText = group ? ` for Group '${group}'` : '';

  const prompt = `
  You are an AI assistant that generates round-robin tournament fixtures.
  Generate a complete round-robin fixture for the '${category}' category${groupText} with the following players: ${playerNames.join(', ')}.
  Provide the output as a JSON array where each element is an object with 'player1', 'player2', 'category', and optionally 'group' properties, representing a unique match pairing.
  Ensure every player plays every other player exactly once within their group/category.
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              player1: {
                type: Type.STRING,
                description: 'The name of the first player in the match.',
              },
              player2: {
                type: Type.STRING,
                description: 'The name of the second player in the match.',
              },
              category: {
                type: Type.STRING,
                description: 'The category of the players in the match.',
              },
              group: { // Optional group field
                type: Type.STRING,
                description: 'The group of the players in the match (if applicable).',
              },
            },
            propertyOrdering: ["player1", "player2", "category", "group"],
            required: ["player1", "player2", "category"],
          },
        },
      },
    });

    const jsonStr = response.text.trim();
    // Basic validation to ensure it's an array before parsing
    if (jsonStr.startsWith('[') && jsonStr.endsWith(']')) {
      const fixtureData = JSON.parse(jsonStr);
      // Ensure all items in the fixture have the correct category and group if present
      return fixtureData.map((match: any) => ({ ...match, category, group }));
    } else {
      console.error("Gemini did not return a valid JSON array for fixture:", jsonStr);
      throw new Error("Invalid JSON response for fixture generation.");
    }
  } catch (error) {
    console.error(`Error generating fixture for category ${category}:`, error);
    return []; // Return empty array on error
  }
}

/**
 * Placeholder for generating groups for a hybrid tournament using Gemini.
 * This function is intended to take a list of players for a category and divide them into balanced groups.
 * (Note: Complex grouping logic for 'min 4 players per group' is more reliably done client-side.
 * Gemini can be used for balancing or creative naming, but strict numerical constraints are hard for LLMs).
 * For now, this will return a simplified structure or an empty array.
 */
export async function generateHybridGroupsWithGemini(
  players: Player[],
  category: string,
  minPlayersPerGroup: number,
): Promise<Player[][]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const playerNames = players.map(p => p.name);

  const prompt = `
  You are an AI assistant for a hybrid tournament setup.
  Given ${players.length} players in the '${category}' category: ${playerNames.join(', ')}.
  Divide these players into groups, with a minimum of ${minPlayersPerGroup} players per group.
  The goal is to create as balanced groups as possible.
  Provide the output as a JSON array of arrays, where each inner array represents a group of player names.
  Example: [["PlayerA", "PlayerB", "PlayerC"], ["PlayerD", "PlayerE", "PlayerF"]]
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      },
    });

    const jsonStr = response.text.trim();
    if (jsonStr.startsWith('[') && jsonStr.endsWith(']')) {
      const groupsOfNames: string[][] = JSON.parse(jsonStr);
      // Map names back to player objects
      const groupedPlayers: Player[][] = groupsOfNames.map(groupNames =>
        groupNames.map(name => players.find(p => p.name === name)).filter((p): p is Player => p !== undefined)
      );
      // Basic validation: ensure groups meet min size (Gemini might not strictly adhere)
      const validGroups = groupedPlayers.filter(group => group.length >= minPlayersPerGroup);
      if (validGroups.length < groupedPlayers.length) {
        console.warn("Gemini-generated groups did not all meet minimum player count. Returning only valid groups.");
      }
      return validGroups;

    } else {
      console.error("Gemini did not return a valid JSON array of arrays for groups:", jsonStr);
      throw new Error("Invalid JSON response for hybrid group generation.");
    }
  } catch (error) {
    console.error(`Error generating hybrid groups for category ${category}:`, error);
    return [];
  }
}

/**
 * Placeholder for generating a knockout bracket from a list of players (e.g., group winners).
 */
export async function generateKnockoutBracketWithGemini(
  players: Player[],
  category?: string,
): Promise<{ player1: string; player2: string; category?: string; }[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const playerNames = players.map(p => p.name);

  const prompt = `
  You are an AI assistant that generates knockout tournament brackets.
  Given the following players${category ? ` in the '${category}' category` : ''}: ${playerNames.join(', ')}.
  Generate the pairings for the first round of a knockout tournament.
  Provide the output as a JSON array where each element is an object with 'player1' and 'player2' properties.
  Ensure there are unique pairings suitable for a knockout format.
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              player1: { type: Type.STRING },
              player2: { type: Type.STRING },
              category: { type: Type.STRING },
            },
            propertyOrdering: ["player1", "player2", "category"],
            required: ["player1", "player2"],
          },
        },
      },
    });

    const jsonStr = response.text.trim();
    if (jsonStr.startsWith('[') && jsonStr.endsWith(']')) {
      const bracketData = JSON.parse(jsonStr);
      return bracketData.map((match: any) => ({ ...match, category }));
    } else {
      console.error("Gemini did not return a valid JSON array for knockout bracket:", jsonStr);
      throw new Error("Invalid JSON response for knockout bracket generation.");
    }
  } catch (error) {
    console.error(`Error generating knockout bracket for category ${category}:`, error);
    return [];
  }
}