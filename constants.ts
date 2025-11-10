import { MatchFormat, TournamentType } from './types';

export const TOURNAMENT_APP_STORAGE_KEY = 'tournamentApp';
export const GEMINI_MODEL_TEXT = 'gemini-2.5-flash';

export const PLAYER_CATEGORIES = ['30+', '40+', '50+', '60+', '70+']; // 'Open' category removed, '70+' added
export const DEFAULT_PLAYER_CATEGORY = '30+'; // Default changed to '30+'

export const TOURNAMENT_TYPES: TournamentType[] = [ // New: Tournament types
  TournamentType.Open,
  TournamentType.MenSingles,
  TournamentType.WomenSingles,
  TournamentType.MenDoubles,
  TournamentType.WomenDoubles,
  TournamentType.MixedDoubles,
];
export const DEFAULT_TOURNAMENT_TYPE = TournamentType.Open;

export const MATCH_FORMATS = [MatchFormat.Knockout, MatchFormat.RoundRobin, MatchFormat.Hybrid]; // Updated: Tournament match formats

export const DEFAULT_MIN_PLAYERS_PER_HYBRID_GROUP = 4; // New: Default min players for hybrid groups