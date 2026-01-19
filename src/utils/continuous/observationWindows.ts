import type { CoverageStats } from '../../types/Insights'

export interface ObservationWindow {
	startMs: number
	endMs: number
}

export interface EventStream {
	times: number[]
	types: string[]
	typeIndex: Map<string, number>
	typeNames: string[]
}

export function coverageToWindows (coverage: CoverageStats, minGapMs: number = 6 * 60 * 60 * 1000): ObservationWindow[] {
	const activePeriods = coverage.periods.filter(p => !p.isGap)
	if (activePeriods.length === 0) { return [] }

	const raw: ObservationWindow[] = activePeriods.map(p => ({
		startMs: p.startDate.getTime(),
		endMs: p.endDate.getTime() + 24 * 60 * 60 * 1000
	}))

	raw.sort((a, b) => a.startMs - b.startMs)

	const merged: ObservationWindow[] = []
	let current = { ...raw[0] }

	for (let i = 1; i < raw.length; i++) {
		if (raw[i].startMs <= current.endMs + minGapMs) {
			current.endMs = Math.max(current.endMs, raw[i].endMs)
		} else {
			merged.push(current)
			current = { ...raw[i] }
		}
	}
	merged.push(current)

	return merged
}

export function totalObservedMs (windows: ObservationWindow[]): number {
	return windows.reduce((sum, w) => sum + (w.endMs - w.startMs), 0)
}

export function isInObservationWindow (t: number, windows: ObservationWindow[]): boolean {
	for (const w of windows) {
		if (t >= w.startMs && t < w.endMs) { return true }
		if (w.startMs > t) { break }
	}
	return false
}

export function buildEventStream (
	tracks: Array<{ trackName: string; date: string }>,
	windows: ObservationWindow[]
): EventStream {
	const typeSet = new Set<string>()
	const events: Array<{ time: number; type: string }> = []

	for (const track of tracks) {
		const t = new Date(track.date).getTime()
		if (isNaN(t)) { continue }
		if (!isInObservationWindow(t, windows)) { continue }

		typeSet.add(track.trackName)
		events.push({ time: t, type: track.trackName })
	}

	events.sort((a, b) => a.time - b.time)

	const typeNames = Array.from(typeSet).sort()
	const typeIndex = new Map(typeNames.map((name, idx) => [name, idx]))

	return {
		times: events.map(e => e.time),
		types: events.map(e => e.type),
		typeIndex,
		typeNames
	}
}

export function getEventsByType (stream: EventStream): Map<string, number[]> {
	const byType = new Map<string, number[]>()
	for (const name of stream.typeNames) {
		byType.set(name, [])
	}
	for (let i = 0; i < stream.times.length; i++) {
		byType.get(stream.types[i])!.push(stream.times[i])
	}
	return byType
}
