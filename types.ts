
// Fix: Replaced placeholder "full contents of types.ts" with actual type definitions.
export interface Player {
  id: string;
  name: string;
  mobileNumber: string; // Added for player identification and QR generation
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  category: string; // e.g., 'Open', '30+', '40+'
  imageUrl?: string; // Optional URL for player profile image
  qrData?: string; // Optional QR code data, generated from player details
}

export enum MatchFormat {
  Knockout = 'knockout',
  RoundRobin = 'round-robin',
  Hybrid = 'hybrid', // New: Initial Round Robin, then Knockout
}

export enum TournamentType {
  Open = 'open',
  MenSingles = 'men_singles',
  WomenSingles = 'women_singles',
  MenDoubles = 'men_doubles',
  WomenDoubles = 'women_doubles',
  MixedDoubles = 'mixed_doubles',
}

export interface Match {
  id: string;
  player1Id: string;
  player2Id: string;
  score1: number | null;
  score2: number | null;
  winnerId: string | null; // Null if draw or not completed
  round: number;
  isComplete: boolean;
  category?: string; // New: For category-specific matches
  group?: string; // New: For group stage matches in hybrid/RR tournaments
}

export interface TournamentSettings {
  tournamentName: string;
  numRounds: number;
  selectedPlayerIds: string[]; // Players selected for this tournament (for Knockout)
  matchFormat: MatchFormat; // Updated to use enum
  tournamentType: TournamentType; // New: e.g., 'Open', 'Men Singles', 'Mixed Doubles'
  minPlayersPerHybridGroup?: number; // New: Minimum players per group for hybrid format
  customFixtureUploaded?: boolean; // New: Flag if admin uploaded their own fixture
}

export interface TournamentState {
  players: Player[];
  matches: Match[];
  currentRound: number;
  tournamentSettings: TournamentSettings | null;
  roundSummaries: Record<number, string>;
  isAdminLoggedIn: boolean;
  currentMode: 'admin' | 'user';
  activeFixtureCategories: string[]; // For Round Robin, tracks which categories have matches added to tournament
  generatedFixtures: Record<string, { player1: string; player2: string; category?: string; group?: string; }[]>; // New: Store generated fixtures by category
  isGeneratingFixture: Record<string, boolean>; // New: Track loading state per category
  generatedHybridGroups: Record<string, Player[][]>; // New: Store generated groups for hybrid (e.g., category -> array of groups)
  isGeneratingHybridGroups: Record<string, boolean>; // New: Track loading for hybrid groups
  publishedFixtures: Record<string, { player1: string; player2: string; category?: string; group?: string; }[]>; // New: Stores fixtures published to player portal
  isBulkUploadingPlayers: boolean; // New: track loading state for CSV player upload
}

// Interface for bulk player upload from CSV
export interface CsvPlayer {
  name: string;
  mobileNumber: string;
  rating?: number;
  category?: string;
}

// New interface for custom fixture upload from CSV
export interface CsvMatch {
  player1: string;
  player2: string;
  round: number;
  category?: string;
  group?: string;
}
