import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GEMINI_MODEL_TEXT } from '../constants';
import { Player, CsvMatch } from '../types';

// Initialize the GoogleGenAI client with the API key from environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates an exciting and concise summary for the given round of matches.
 */
export async function generateRoundSummary(
  currentRound: number,
  matches: CsvMatch[],
  players: Player[]
): Promise<string> {
  const playerMap = new Map(players.map(p => [p.id, p]));
  const matchDetails = matches.map(match => {
    // Attempt to get player names from the full player list using IDs
    const player1Name = playerMap.get(match.player1)?.name || match.player1; // Fallback to match.player1 if ID lookup fails
    const player2Name = playerMap.find(p => p.id === match.player2)?.name || match.player2; // Fix: Use find for player2, and then .name
    const categoryDetail = match.category ? ` in ${match.category} category` : '';
    const groupDetail = match.group ? ` (Group: ${match.group})` : '';
    return `- ${player1Name} vs ${player2Name}${categoryDetail}${groupDetail}`;
  }).join('\n');

  const prompt = `You are a professional sports commentator. Provide an exciting and concise summary for Round ${currentRound} of the tournament.
Here are the matches that took place in this round:\n${matchDetails}\n
Focus on key matchups, close calls, and notable performances. Keep it under 200 words.`;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: [{ parts: [{ text: prompt }] }],
    });
    return response.text.trim();
  } catch (error) {
    console.error('Error generating round summary:', error);
    return 'Failed to generate round summary.';
  }
}

/**
 * Generates a complete single round-robin fixture for a given category of players.
 */
// Fix: Add `round: number` to the responseSchema for generateRoundRobinFixture to align with CsvMatch.
export async function generateRoundRobinFixture(
  players: Player[],
  category: string,
): Promise<CsvMatch[]> { // Change return type to CsvMatch[]
  const categoryPlayers = players.filter(p => p.category === category);
  if (categoryPlayers.length < 2) {
    throw new Error('Need at least two players to generate a round-robin fixture.');
  }

  const prompt = `Generate a complete single round-robin fixture for the following players in the '${category}' category.
Ensure every player plays against every other player exactly once.
Provide the output as a JSON array of objects, where each object has 'player1' (player name), 'player2' (player name), 'category' (string), and 'round' (number, always 1 for this initial fixture) fields.
The player names must exactly match the provided list.

Players in '${category}' category: ${categoryPlayers.map(p => p.name).join(', ')}
`;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              player1: { type: Type.STRING, description: 'Name of the first player' },
              player2: { type: Type.STRING, description: 'Name of the second player' },
              category: { type: Type.STRING, description: 'Category of the match' },
              round: { type: Type.INTEGER, description: 'Round number, always 1 for this fixture' }, // Added round
            },
            required: ['player1', 'player2', 'category', 'round'], // Added round
            propertyOrdering: ['player1', 'player2', 'category', 'round'], // Added round
          },
        },
      },
    });

    let jsonStr = response.text.trim();
    // Fix: Sometimes the model might include markdown backticks. Remove them.
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.substring(7);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.substring(0, jsonStr.length - 3);
    }

    const fixture: CsvMatch[] = JSON.parse(jsonStr); // Cast to CsvMatch[]

    // Basic validation to ensure all players are included and no duplicates
    const generatedPlayerNames = new Set<string>();
    fixture.forEach((match: CsvMatch) => { // Use CsvMatch type
      generatedPlayerNames.add(match.player1);
      generatedPlayerNames.add(match.player2);
    });

    const providedPlayerNames = new Set(categoryPlayers.map(p => p.name));
    const missingPlayers = Array.from(providedPlayerNames).filter(name => !generatedPlayerNames.has(name));
    if (missingPlayers.length > 0) {
      console.warn(`Generated fixture for ${category} might be incomplete, missing players: ${missingPlayers.join(', ')}`);
      // Optionally, throw an error or attempt regeneration for stricter validation.
    }

    return fixture;
  } catch (error) {
    console.error(`Error generating round-robin fixture for category ${category}:`, error);
    throw new Error(`Failed to generate round-robin fixture for ${category}. Ensure players are unique and sufficient. Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generates groups and round-robin fixtures for a hybrid tournament format.
 * Returns an object with generated groups (Player[][]) and fixtures (CsvMatch[][]),
 * keyed by a unique identifier for the category/group.
 */
// Fix: Adjust the type of `fixtures` in the returned object and ensure `round` is included in generated matches.
export async function generateHybridGroupsAndFixtures(
  allPlayers: Player[],
  category: string,
  minPlayersPerGroup: number,
): Promise<{ groups: Player[][]; fixtures: Record<string, CsvMatch[]> }> { // Return type adjusted
  const categoryPlayers = allPlayers.filter(p => p.category === category);

  if (categoryPlayers.length < minPlayersPerGroup) {
    // If not enough players for grouping, treat as a single group and generate one RR fixture.
    console.log(`Not enough players (${categoryPlayers.length}) in ${category} for multiple groups (min: ${minPlayersPerGroup}). Generating single RR fixture.`);
    const fixture = await generateRoundRobinFixture(categoryPlayers, category); // This now returns CsvMatch[]
    return {
      groups: [categoryPlayers],
      fixtures: { [`${category}-Group-1`]: fixture.map(m => ({ ...m, group: 'Group 1' })) }
    };
  }

  // Heuristic for number of groups: aim for groups of ~minPlayersPerGroup up to 8 players (common for RR),
  // but ensure at least 2 groups if there are enough players.
  const idealGroupSize = Math.max(minPlayersPerGroup, Math.min(8, Math.ceil(categoryPlayers.length / 2)));
  let numberOfGroups = Math.max(1, Math.round(categoryPlayers.length / idealGroupSize));
  // Ensure we don't create too many groups if there are few players,
  // and each group meets the minPlayersPerGroup criteria.
  if (categoryPlayers.length / numberOfGroups < minPlayersPerGroup) {
    numberOfGroups = Math.floor(categoryPlayers.length / minPlayersPerGroup);
    if (numberOfGroups === 0) numberOfGroups = 1; // Fallback to 1 group if it can't meet min criteria even with all players
  }
  numberOfGroups = Math.max(1, numberOfGroups); // Ensure at least one group

  const prompt = `For the '${category}' category, divide the following players into ${numberOfGroups} groups for an initial round-robin stage.
Each group should have at least ${minPlayersPerGroup} players. After grouping, generate a complete single round-robin fixture for each group.
Ensure every player within a group plays against every other player in that group exactly once.
The output should be a JSON object with two main properties: 'groups' and 'fixtures'.
'groups' should be an array of arrays, where each inner array represents a group and contains player names (string).
'fixtures' should be an object where keys are group identifiers (e.g., "Group 1", "Group 2") and values are arrays of match objects.
Each match object should have 'player1' (player name), 'player2' (player name), 'category' (string), 'group' (string), and 'round' (number, always 1 for this stage) fields.
The player names in the output must exactly match the provided list.

Players in '${category}' category: ${categoryPlayers.map(p => p.name).join(', ')}
Minimum players per group: ${minPlayersPerGroup}
Number of groups to aim for: ${numberOfGroups} (adjust if needed to meet minPlayersPerGroup criteria)
`;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            groups: {
              type: Type.ARRAY,
              items: {
                type: Type.ARRAY,
                items: { type: Type.STRING, description: 'Player name' },
              },
              description: 'Array of player groups, each containing player names',
            },
            fixtures: {
              type: Type.OBJECT,
              additionalProperties: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    player1: { type: Type.STRING, description: 'Name of the first player' },
                    player2: { type: Type.STRING, description: 'Name of the second player' },
                    category: { type: Type.STRING, description: 'Category of the match' },
                    group: { type: Type.STRING, description: 'Group identifier (e.g., "Group 1")' },
                    // Fix: Add 'round' to the responseSchema for consistency with CsvMatch
                    round: { type: Type.INTEGER, description: 'Round number, always 1 for this fixture' },
                  },
                  // Fix: Add 'round' to the required properties for consistency
                  required: ['player1', 'player2', 'category', 'group', 'round'],
                  // Fix: Add 'round' to propertyOrdering for consistency
                  propertyOrdering: ['player1', 'player2', 'category', 'group', 'round'],
                },
              },
              description: 'Object of fixtures, keyed by group identifier',
            },
          },
          required: ['groups', 'fixtures'],
          propertyOrdering: ['groups', 'fixtures'],
        },
      },
    });

    let jsonStr = response.text.trim();
    // Fix: Sometimes the model might include markdown backticks. Remove them.
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.substring(7);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.substring(0, jsonStr.length - 3);
    }

    const result: { groups: string[][]; fixtures: Record<string, CsvMatch[]> } = JSON.parse(jsonStr); // Cast to CsvMatch[]

    // Map player names back to Player objects
    const groupsAsPlayers: Player[][] = result.groups.map(groupNames =>
      groupNames.map(name => {
        const player = allPlayers.find(p => p.name === name);
        if (!player) {
          console.warn(`Player "${name}" not found when reconstructing groups for category ${category}.`);
          // Create a placeholder player to prevent app crash, or handle as a stricter error.
          return { id: `unknown-${name}-${Date.now()}`, name: name, mobileNumber: '', rating: 0, wins: 0, losses: 0, draws: 0, category: category };
        }
        return player;
      })
    );

    return { groups: groupsAsPlayers, fixtures: result.fixtures };

  } catch (error) {
    console.error(`Error generating hybrid groups and fixtures for category ${category}:`, error);
    throw new Error(`Failed to generate hybrid groups and fixtures for ${category}. Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}