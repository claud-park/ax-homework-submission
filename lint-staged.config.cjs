module.exports = {
  '**/*.{ts,tsx,js,jsx}': (filenames) =>
    `node_modules/.bin/next lint --fix ${filenames.flatMap((f) => ['--file', f]).join(' ')}`,
  '**/*.{ts,tsx}': () => 'bun run typecheck',
}
