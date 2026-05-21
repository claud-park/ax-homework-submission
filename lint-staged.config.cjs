module.exports = {
  '**/*.{ts,tsx,js,jsx}': (filenames) =>
    ['next', 'lint', '--fix', ...filenames.flatMap((f) => ['--file', f])],
  '**/*.{ts,tsx}': () => 'bun run typecheck',
}
