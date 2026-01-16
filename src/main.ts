import { Game } from './core/Game';

/**
 * Main entry point - bootstraps the game
 */
window.addEventListener('DOMContentLoaded', async () => {
    const game = new Game('renderCanvas');
    await game.start();
});
