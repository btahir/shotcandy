# Contributing to Shotcandy

Thanks for helping. Bug reports, style ideas and pull requests are all welcome.

## Reporting a bug or asking for something

Open an [issue](https://github.com/btahir/shotcandy/issues/new/choose) and pick a template. For bugs, say which browser you used and attach the screenshot you were styling if you can. Style requests with an example image are the easiest to act on.

## Working on the code

You need Node 20.9 or newer and pnpm.

```bash
pnpm i
pnpm dev            # http://localhost:3000
```

Before you open a pull request:

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e       # builds the site, then runs the Playwright suites
```

A few house rules:

- Keep the engine pure: no DOM or React imports in `src/engine`, and no clocks or unseeded randomness in anything that renders.
- Add tests with your change. If you change how something looks on purpose, update the Playwright baselines (`pnpm test:e2e:update`) and say so in the PR.
- Use the fictional samples in `brand/samples` for demos and tests. Please don't add real product screenshots, logos or vendor device art.
- Keep the UI plain: sentence case, verb-first buttons, and every control reachable by keyboard.
- Nothing may send a user's images anywhere. Shotcandy has no server, and it should stay that way.

Small pull requests are easier to review than big ones. If you're planning something large, open an issue first so we can agree on the shape.

## License

By contributing you agree that your work is released under the project's [MIT license](LICENSE).
