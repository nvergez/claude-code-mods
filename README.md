# claude-code-mods

Mods for [Claude Code](https://claude.com/claude-code). A mod is a plugin made of function hooks: a small TypeScript module that runs inside your Claude Code session. Each folder of this repo is one mod, and the repo is a plugin marketplace, so a mod installs in two commands.

| Mod | What it does |
| --- | --- |
| [`voice-summary`](#voice-summary) | Speaks a one-sentence summary of each turn when it ends |

## Install

```sh
claude plugin marketplace add nvergez/claude-code-mods
claude plugin install voice-summary@claude-code-mods
```

Then start a new Claude Code session. The same two steps exist inside a session, under `/plugin`.

Before you install:

- **Early access.** Mods use Claude Code's function-hooks plugin API. It needs a recent Claude Code, it is rolled out per account, and it can change between releases. Where it is not available, the plugin installs but its hooks do not load and the mod does nothing.
- **Trust.** A mod is code that runs in your session and can reach what the session reaches: the model, files, commands, the network. Read a mod's `hooks/register.ts` before installing it.

### Configure, update, remove

A mod's settings are rows of `/config`, and `/plugin configure voice-summary@claude-code-mods` lists them too. They can also be given at install:

```sh
claude plugin install voice-summary@claude-code-mods --config minSeconds=30 --config language=en
```

```sh
# update
claude plugin marketplace update claude-code-mods
claude plugin update voice-summary@claude-code-mods

# remove
claude plugin uninstall voice-summary@claude-code-mods
```

## voice-summary

When a turn of the main conversation ends, a small model writes a recap of one or two sentences and it is read aloud. Made for long turns you do not watch, and for several sessions running side by side.

- Silent for subagent turns, for turns you interrupt, and for turns shorter than the minimum length.
- A turn that dies on an API error is announced with a fixed sentence, without a model call.
- The recap is prepared after the turn has ended, so the prompt never waits for it.
- Summaries are spoken one at a time, in turn order.

macOS only: the system voice is `say`, and audio clips play through `afplay`.

### Settings

| Row in `/config` | Option | Default | Notes |
| --- | --- | --- | --- |
| Voice summary | `enabled` | `true` | Turns the mod on or off |
| Minimum turn length (seconds) | `minSeconds` | `15` | `0` speaks every turn |
| Summary language | `language` | `fr` | `fr` or `en`; pick the one your voice reads |
| System voice | `voice` | system default | Exact name from `say -v '?'` |
| Summary model | `model` | `haiku` | Alias or model id that writes the recap |
| ElevenLabs voice ID | `elevenLabsVoiceId` | empty | Empty keeps the system voice |
| ElevenLabs model | `elevenLabsModel` | `eleven_v4_turbo` | `eleven_v4` and `eleven_multilingual_v2` cost twice as much per character |

The default language is French: set `language` to `en` for English summaries.

### ElevenLabs voice (optional)

1. Put a voice ID in the "ElevenLabs voice ID" row of `/config`.
2. Export your API key in your shell profile:

   ```sh
   export ELEVENLABS_API_KEY="..."
   ```

3. Start Claude Code from a shell that has the variable. A terminal opened before the profile changed does not have it: open a new one, or run `source ~/.zshrc` first.

The key is read from the environment and never stored in the mod's settings. Each summary is sent to ElevenLabs and billed per character.

The system voice takes over, and a dim line in the transcript says why, when the key is missing, when ElevenLabs refuses the request, or when it does not answer within 15 seconds. Voices from the ElevenLabs library and cloned voices need a paid plan to be used through the API.

## Development

An installed mod is a copy: editing this repo does not change it. To work on a mod, load it from your clone instead. Name each mod folder in `CLAUDE_CODE_PLUGIN_DIRS`, in the `env` block of `~/.claude/settings.json` (several folders are separated by `:`), then restart Claude Code:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/projects/claude-code-mods/voice-summary"
  }
}
```

For one session only, `claude --plugin-dir <mod folder>` does the same. Folders loaded this way are watched: saving a file reloads the mod in the running session. Do not also install the same mod from the marketplace, or it runs twice.

A mod loaded from a folder keeps its settings under `pluginConfigs["<mod>@inline"]` in `~/.claude/settings.json`; an installed one under `pluginConfigs["<mod>@claude-code-mods"]`.

```sh
claude plugin validate .               # the marketplace manifest
claude plugin validate voice-summary   # what the engine will accept
claude plugin test voice-summary       # runs tests/*.test.ts against the engine
tsc -p voice-summary                   # type-check
```

`tsc` needs the type declarations Claude Code writes into `<mod>/.claude-plugin/types/` the first time it loads the mod. That folder is generated and ignored by git.

A reload discards what the mod was doing. With `voice-summary`, a turn in which the mod's own files changed ends without a spoken summary.

### Adding a mod

```
<mod-name>/
  .claude-plugin/plugin.json   name, version, description, userConfig
  hooks/hooks.json             { "modules": ["./register.ts"] }
  hooks/register.ts            export const register: Register = (on, options) => { ... }
  tests/<mod-name>.test.ts
  tsconfig.json                { "extends": "./.claude-plugin/types/tsconfig.json" }
```

Then list it in `.claude-plugin/marketplace.json`, and bump the mod's `version` in its `plugin.json` when you publish a change.
