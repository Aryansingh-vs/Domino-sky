import DominoSky from '@/components/domino-sky'
import type { Scenario } from '@/src/engine'

const presets: Record<string, Scenario> = {
  BOM: { airport: 'BOM', start: '09:00', end: '10:30' },
  DEL: { airport: 'DEL', start: '12:00', end: '13:30' },
  HYD: { airport: 'HYD', start: '11:30', end: '13:00' },
  CCU: { airport: 'CCU', start: '12:00', end: '13:30' },
}

export default async function SimulatorPage({ searchParams }: { searchParams: Promise<{ airport?: string; start?: string; end?: string }> }) {
  const params = await searchParams
  const preset = presets[params.airport ?? 'DEL'] ?? presets.DEL
  const validTime = (time?: string) => Boolean(time && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
  const initialScenario: Scenario = {
    airport: preset.airport,
    start: validTime(params.start) ? params.start! : preset.start,
    end: validTime(params.end) ? params.end! : preset.end,
  }
  return <DominoSky initialScenario={initialScenario} />
}
