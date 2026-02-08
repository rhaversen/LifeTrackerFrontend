import type { CoverageStats } from '../../types/Insights'
import type { Track } from '../../types/Track'

import type { BinnedData, ObservationWindow, PipelineConfig } from './types'

const MS_PER_HOUR_LOCAL = 60 * 60 * 1000

export function coverageToWindows (coverage: CoverageStats, minGapMs: number = 6 * MS_PER_HOUR_LOCAL): ObservationWindow[] {
	const activePeriods = coverage.periods.filter(p => !p.isGap)
	if (activePeriods.length === 0) {
		return []
	}

	const raw: ObservationWindow[] = activePeriods.map(p => ({
		startMs: p.startDate.getTime(),
		endMs: p.endDate.getTime() + 24 * MS_PER_HOUR_LOCAL
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

export function isInWindow (t: number, windows: ObservationWindow[]): boolean {
	for (const w of windows) {
		if (t >= w.startMs && t < w.endMs) {
			return true
		}
		if (w.startMs > t) {
			break
		}
	}
	return false
}

interface ParsedEvent {
	time: number
	typeName: string
}

function parseAndFilterEvents (tracks: Track[], windows: ObservationWindow[]): ParsedEvent[] {
	const events: ParsedEvent[] = []

	for (const track of tracks) {
		const t = new Date(track.date).getTime()
		if (isNaN(t)) {
			continue
		}
		if (!isInWindow(t, windows)) {
			continue
		}
		events.push({ time: t, typeName: track.trackName })
	}

	events.sort((a, b) => a.time - b.time)
	return events
}

function buildTypeIndex (events: ParsedEvent[]): { typeNames: string[], typeIndex: Map<string, number> } {
	const typeSet = new Set<string>()
	for (const e of events) {
		typeSet.add(e.typeName)
	}

	const typeNames = Array.from(typeSet).sort()
	const typeIndex = new Map<string, number>()
	for (let i = 0; i < typeNames.length; i++) {
		typeIndex.set(typeNames[i], i)
	}

	return { typeNames, typeIndex }
}

interface BinSpec {
	startMs: number
	widthMs: number
	windowIndex: number
}

function createBins (windows: ObservationWindow[], binWidthMs: number): BinSpec[] {
	const bins: BinSpec[] = []

	for (let wi = 0; wi < windows.length; wi++) {
		const w = windows[wi]
		let startMs = w.startMs

		while (startMs < w.endMs) {
			const widthMs = Math.min(binWidthMs, w.endMs - startMs)
			bins.push({ startMs, widthMs, windowIndex: wi })
			startMs += binWidthMs
		}
	}

	return bins
}

function computeBinWidthMs (windows: ObservationWindow[], config: PipelineConfig['binning']): number {
	const totalMs = totalObservedMs(windows)
	const proposed = totalMs / config.targetMaxBins
	return Math.max(config.minBinMs, Math.min(config.maxBinMs, proposed))
}

export function discretizeEvents (
	tracks: Track[],
	windows: ObservationWindow[],
	config: PipelineConfig['binning']
): BinnedData {
	const events = parseAndFilterEvents(tracks, windows)
	const { typeNames, typeIndex } = buildTypeIndex(events)
	const numTypes = typeNames.length

	if (events.length === 0 || numTypes === 0) {
		return {
			T: 0,
			numTypes: 0,
			binStartMs: new Float64Array(0),
			dtHours: new Float32Array(0),
			y: new Uint16Array(0),
			typeNames: [],
			typeIndex: new Map(),
			eventCountsByType: new Uint32Array(0)
		}
	}

	const binWidthMs = computeBinWidthMs(windows, config)
	const binSpecs = createBins(windows, binWidthMs)
	const T = binSpecs.length

	const binStartMs = new Float64Array(T)
	const dtHours = new Float32Array(T)

	for (let t = 0; t < T; t++) {
		binStartMs[t] = binSpecs[t].startMs
		dtHours[t] = binSpecs[t].widthMs / MS_PER_HOUR_LOCAL
	}

	const maxCount = events.length
	const useUint32 = maxCount > 65535
	const y = useUint32
		? new Uint32Array(T * numTypes)
		: new Uint16Array(T * numTypes)

	const eventCountsByType = new Uint32Array(numTypes)

	let binIdx = 0
	let eventIdx = 0

	while (eventIdx < events.length && binIdx < T) {
		const event = events[eventIdx]
		const binStart = binSpecs[binIdx].startMs
		const binEnd = binStart + binSpecs[binIdx].widthMs

		if (event.time < binStart) {
			eventIdx++
			continue
		}

		if (event.time >= binEnd) {
			binIdx++
			continue
		}

		const typeIdx = typeIndex.get(event.typeName)!
		const yIdx = binIdx * numTypes + typeIdx
		y[yIdx]++
		eventCountsByType[typeIdx]++
		eventIdx++
	}

	return {
		T,
		numTypes,
		binStartMs,
		dtHours,
		y,
		typeNames,
		typeIndex,
		eventCountsByType
	}
}

export function getEventsPerTypeBins (binnedData: BinnedData): Int32Array[] {
	const { T, numTypes, y } = binnedData
	const result: Int32Array[] = []

	for (let k = 0; k < numTypes; k++) {
		const bins: number[] = []
		for (let t = 0; t < T; t++) {
			const count = y[t * numTypes + k]
			for (let c = 0; c < count; c++) {
				bins.push(t)
			}
		}
		result.push(new Int32Array(bins))
	}

	return result
}

export function getEventTimesPerType (
	tracks: Track[],
	windows: ObservationWindow[],
	typeIndex: Map<string, number>
): Float64Array[] {
	const numTypes = typeIndex.size
	const timesByType: number[][] = Array.from({ length: numTypes }, () => [])

	for (const track of tracks) {
		const t = new Date(track.date).getTime()
		if (isNaN(t)) {
			continue
		}
		if (!isInWindow(t, windows)) {
			continue
		}

		const idx = typeIndex.get(track.trackName)
		if (idx !== undefined) {
			timesByType[idx].push(t)
		}
	}

	for (let k = 0; k < numTypes; k++) {
		timesByType[k].sort((a, b) => a - b)
	}

	return timesByType.map(arr => new Float64Array(arr))
}
