// AI entry point: answers a request on behalf of an AI player.
// Levels: 'random' (fuzzing / weakest), 'easy', 'normal', 'hard' (heuristic.js).

import { randomDecide } from './random.js';
import { heuristicDecide } from './heuristic.js';

export function decide(game, req, rng) {
  const level = game.P(req.pid).level || 'normal';
  if (level === 'random') return randomDecide(game, req, rng);
  return heuristicDecide(game, req, rng, level);
}
