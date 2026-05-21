// lint-staged.config.js
module.exports = {
  '**/*.{ts,tsx,js,jsx}': (filenames) =>
    `next lint --fix --file ${filenames.join(' --file ')}`,
  '**/*.{ts,tsx}': () => 'bun run typecheck',
}
