import { expect, mock, test } from 'claude-code/testing'
import type { AudioClip, HttpInit, HttpResponse, On } from 'claude-code'

type Said = { text: string; voice: string | undefined }
type Fetched = { url: string; init: HttpInit | undefined }

type World = {
  /** What the summary model answers; null when it gives no text. */
  reply?: string | null
  /** The environment's ELEVENLABS_API_KEY; left out, the variable is unset. */
  key?: string
  /** What ElevenLabs answers a request with. */
  elevenLabs?: HttpResponse
}

const USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

const TURN = {
  answer: 'All 42 tests pass after the fix in the parser.',
  durationMs: 60_000,
  isAborted: false,
  turnId: 'turn-1',
  reason: 'answer',
} as const

const SPEECH: HttpResponse = {
  status: 200,
  ok: true,
  headers: {},
  text: JSON.stringify({ audio_base64: 'QUJD', alignment: null }),
}

const QUOTA: HttpResponse = {
  status: 401,
  ok: false,
  headers: {},
  text: JSON.stringify({ detail: { status: 'quota_exceeded', message: 'x' } }),
}

const ELEVEN = { elevenLabsVoiceId: 'voice 123' }

/** The engine beneath the mod: a clock the test moves, and a model, a network and a speaker it records. */
const world = (on: On, { reply = 'Les tests passent.', key, elevenLabs = SPEECH }: World = {}) => {
  const clock = mock.clock(on)
  const said: Said[] = []
  const played: AudioClip[] = []
  const fetched: Fetched[] = []
  const logged: string[] = []
  const asked: { system: string | undefined; prompt: string }[] = []

  mock.env(on, key === undefined ? {} : { ELEVENLABS_API_KEY: key })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.log', ($, e) => {
    logged.push(e.text)

    return { value: undefined }
  })
  on('model.complete', ($, e) => {
    asked.push({ system: e.system, prompt: e.prompt })

    return reply === null
      ? { value: { isAnswered: false, reason: 'empty-reply', usage: USAGE } }
      : { value: { isAnswered: true, text: reply, usage: USAGE } }
  })
  on('audio.speak', ($, e) => {
    said.push({ text: e.text, voice: e.voice })

    return { value: { via: 'system' } }
  })
  on('audio.play', ($, e) => {
    played.push(e.clip)

    return { value: undefined }
  })
  on('http.fetch', ($, e) => {
    fetched.push({ url: e.url, init: e.init })

    return { value: elevenLabs }
  })

  return { clock, said, played, fetched, logged, asked }
}

test('speaks the summary of a long main-loop turn and leaves the answer alone', async ($, on) => {
  const { clock, said, played, fetched, asked } = world(on)

  const result = await $.turn.complete(TURN)
  await clock.settle()

  expect(result.text).toBe(TURN.answer)
  expect(said.map(one => one.text)).toEqual(['Les tests passent.'])
  expect(said[0]?.voice).toBeUndefined()
  expect(asked[0]?.prompt).toContain(TURN.answer)
  expect(asked[0]?.system).toContain('French')
  expect(fetched).toEqual([])
  expect(played).toEqual([])
})

test('does not delay the end of the turn', async ($, on) => {
  const { clock, said } = world(on)

  await $.turn.complete(TURN)

  expect(said).toEqual([])
  await clock.settle()
  expect(said.length).toBe(1)
})

test('stays silent for a short turn', async ($, on) => {
  const { clock, said, asked } = world(on)

  await $.turn.complete({ ...TURN, durationMs: 2_000 })
  await clock.settle()

  expect(said).toEqual([])
  expect(asked).toEqual([])
})

test('stays silent for a subagent turn', async ($, on) => {
  const { clock, said } = world(on)

  await $.turn.complete({ ...TURN, agentId: 'agent-1' })
  await clock.settle()

  expect(said).toEqual([])
})

test('stays silent when the person interrupted the turn', async ($, on) => {
  const { clock, said } = world(on)

  await $.turn.complete({ ...TURN, reason: 'aborted', isAborted: true })
  await clock.settle()

  expect(said).toEqual([])
})

test('says the turn failed, without a model call, on an API error', async ($, on) => {
  const { clock, said, asked } = world(on)

  await $.turn.complete({ ...TURN, answer: '', reason: 'error' })
  await clock.settle()

  expect(said.map(one => one.text)).toEqual(["Le tour s'est arrêté sur une erreur."])
  expect(asked).toEqual([])
})

test('falls back to a fixed sentence when the model gives no summary', async ($, on) => {
  const { clock, said } = world(on, { reply: null })

  await $.turn.complete(TURN)
  await clock.settle()

  expect(said.map(one => one.text)).toEqual(["C'est terminé."])
})

test('strips markup before speaking', async ($, on) => {
  const { clock, said } = world(on, { reply: '**Corrigé** : `parser.ts` est\n\n# réparé' })

  await $.turn.complete(TURN)
  await clock.settle()

  expect(said.map(one => one.text)).toEqual(['Corrigé : parser.ts est réparé'])
})

test('is silent when disabled', { options: { enabled: false } }, async ($, on) => {
  const { clock, said, asked } = world(on)

  await $.turn.complete(TURN)
  await clock.settle()

  expect(said).toEqual([])
  expect(asked).toEqual([])
})

test(
  'speaks every turn in the chosen voice and language',
  { options: { minSeconds: 0, language: 'en', voice: 'Samantha' } },
  async ($, on) => {
    const { clock, said, asked } = world(on, { reply: 'Tests pass.' })

    await $.turn.complete({ ...TURN, durationMs: 10 })
    await clock.settle()

    expect(said).toEqual([{ text: 'Tests pass.', voice: 'Samantha' }])
    expect(asked[0]?.system).toContain('English')
  },
)

test(
  'falls back to the default voice when the chosen one cannot speak',
  { options: { voice: 'Nobody' } },
  async ($, on) => {
    const clock = mock.clock(on)
    const said: Said[] = []

    on('turn.complete', ($, e) => ({ text: e.answer }))
    on('ui.log', () => ({ value: undefined }))
    on('model.complete', () => ({
      value: { isAnswered: true, text: 'Fini.', usage: USAGE },
    }))
    on('audio.speak', ($, e) => {
      if (e.voice !== undefined) {
        return { deny: 'voice not installed' }
      }

      said.push({ text: e.text, voice: e.voice })

      return { value: { via: 'system' } }
    })

    await $.turn.complete(TURN)
    await clock.settle()

    expect(said).toEqual([{ text: 'Fini.', voice: undefined }])
  },
)

test('speaks summaries one at a time, in turn order', async ($, on) => {
  const clock = mock.clock(on)
  const said: string[] = []

  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.log', () => ({ value: undefined }))
  on('model.complete', async ($, e) => {
    // The first turn's summary is the slow one: it must still be heard first.
    if (e.prompt.includes('first')) {
      await clock.sleep(1_000)
    }

    return {
      value: {
        isAnswered: true,
        text: e.prompt.includes('first') ? 'Un.' : 'Deux.',
        usage: USAGE,
      },
    }
  })
  on('audio.speak', ($, e) => {
    said.push(e.text)

    return { value: { via: 'system' } }
  })

  await $.turn.complete({ ...TURN, turnId: 'turn-1', answer: 'first answer' })
  await $.turn.complete({ ...TURN, turnId: 'turn-2', answer: 'second answer' })
  await clock.advance(2_000)

  expect(said).toEqual(['Un.', 'Deux.'])
})

test('speaks through ElevenLabs when a voice ID and the key are set', { options: ELEVEN }, async ($, on) => {
  const { clock, said, played, fetched } = world(on, { key: 'secret-key' })

  await $.turn.complete(TURN)
  await clock.settle()

  expect(said).toEqual([])
  expect(played).toEqual([{ base64: 'QUJD', mime: 'audio/mpeg' }])
  expect(fetched.length).toBe(1)
  expect(fetched[0]?.url).toBe(
    'https://api.elevenlabs.io/v1/text-to-speech/voice%20123/with-timestamps?output_format=mp3_44100_128',
  )
  expect(fetched[0]?.init?.method).toBe('POST')
  expect(fetched[0]?.init?.headers?.['xi-api-key']).toBe('secret-key')
  expect(JSON.parse(fetched[0]?.init?.body ?? '{}')).toEqual({
    text: 'Les tests passent.',
    model_id: 'eleven_v4_turbo',
  })
})

test(
  'sends the chosen ElevenLabs model',
  { options: { ...ELEVEN, elevenLabsModel: 'eleven_flash_v2_5' } },
  async ($, on) => {
    const { clock, fetched } = world(on, { key: 'secret-key' })

    await $.turn.complete(TURN)
    await clock.settle()

    expect(JSON.parse(fetched[0]?.init?.body ?? '{}').model_id).toBe('eleven_flash_v2_5')
  },
)

test('uses the system voice, and says why once, when the key is missing', { options: ELEVEN }, async ($, on) => {
  const { clock, said, played, fetched, logged } = world(on)

  await $.turn.complete(TURN)
  await $.turn.complete({ ...TURN, turnId: 'turn-2' })
  await clock.settle()

  expect(said.map(one => one.text)).toEqual(['Les tests passent.', 'Les tests passent.'])
  expect(fetched).toEqual([])
  expect(played).toEqual([])
  expect(logged.filter(line => line.includes('ELEVENLABS_API_KEY')).length).toBe(1)
})

test('uses the system voice when ElevenLabs refuses, never logging the key', { options: ELEVEN }, async ($, on) => {
  const { clock, said, played, logged } = world(on, { key: 'secret-key', elevenLabs: QUOTA })

  await $.turn.complete(TURN)
  await clock.settle()

  expect(said.map(one => one.text)).toEqual(['Les tests passent.'])
  expect(played).toEqual([])
  expect(logged.some(line => line.includes('HTTP 401 quota_exceeded'))).toBe(true)
  expect(logged.some(line => line.includes('secret-key'))).toBe(false)
})

test('names the cause ElevenLabs gave when a plan does not cover the voice', { options: ELEVEN }, async ($, on) => {
  const { clock, said, logged } = world(on, {
    key: 'secret-key',
    elevenLabs: {
      status: 402,
      ok: false,
      headers: {},
      text: JSON.stringify({
        detail: { status: 'payment_required', code: 'paid_plan_required', message: 'x' },
      }),
    },
  })

  await $.turn.complete(TURN)
  await clock.settle()

  expect(said.map(one => one.text)).toEqual(['Les tests passent.'])
  expect(logged.some(line => line.includes('HTTP 402 paid_plan_required'))).toBe(true)
})

test('uses the system voice when ElevenLabs sends no audio', { options: ELEVEN }, async ($, on) => {
  const { clock, said, played } = world(on, {
    key: 'secret-key',
    elevenLabs: { ...SPEECH, text: '<html>gateway</html>' },
  })

  await $.turn.complete(TURN)
  await clock.settle()

  expect(said.map(one => one.text)).toEqual(['Les tests passent.'])
  expect(played).toEqual([])
})

test('uses the system voice when ElevenLabs does not answer in time', { options: ELEVEN }, async ($, on) => {
  const clock = mock.clock(on)
  const said: string[] = []

  mock.env(on, { ELEVENLABS_API_KEY: 'secret-key' })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.log', () => ({ value: undefined }))
  on('model.complete', () => ({
    value: { isAnswered: true, text: 'Fini.', usage: USAGE },
  }))
  on('http.fetch', async () => {
    await clock.sleep(60_000)

    return { value: SPEECH }
  })
  on('audio.speak', ($, e) => {
    said.push(e.text)

    return { value: { via: 'system' } }
  })

  await $.turn.complete(TURN)
  await clock.advance(20_000)

  expect(said).toEqual(['Fini.'])
})
