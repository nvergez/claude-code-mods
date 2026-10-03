# claude-code-mods

Personal mods for [Claude Code](https://claude.com/claude-code). A mod is a plugin made of function hooks: a small TypeScript module that Claude Code loads and hot-reloads. Each folder of this repo is one mod.

> Mods use Claude Code's function-hooks plugin API. It is early access and can change between releases, so a mod may need an update after Claude Code updates.

| Mod | What it does |
| --- | --- |
| [`voice-summary`](#voice-summary) | Speaks a one-sentence summary of each turn when it ends |

## Install

Clone the repo, then name each mod folder in `CLAUDE_CODE_PLUGIN_DIRS`, in the `env` block of `~/.claude/settings.json`. Several folders are separated by `:`.

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/projects/claude-code-mods/voice-summary"
  }
}
```

Restart Claude Code: every session now loads the mod. To try a mod in one session only, use `claude --plugin-dir <mod folder>` instead.

A mod's settings are rows of `/config`. They are stored in `~/.claude/settings.json` under `pluginConfigs["<mod>@inline"].options`.

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

Folders named in `CLAUDE_CODE_PLUGIN_DIRS` are watched: saving a file reloads the mod in the running session.

```sh
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

Then add the folder to `CLAUDE_CODE_PLUGIN_DIRS` and restart Claude Code.
