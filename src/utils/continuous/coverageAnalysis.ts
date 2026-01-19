import type { CoverageStats, TrackingPeriod } from '../../types/Insights'
import type { Track } from '../../types/Track'

export function computeCoverageStats (tracks: Track[]): CoverageStats {
	if (tracks.length === 0) {
		return {
			totalDays: 0,
			activeDays: 0,
			gapDays: 0,
			coveragePercent: 0,
			periods: []
		}
	}

	const validTracks = tracks.filter(t => !isNaN(new Date(t.date).getTime()))
	if (validTracks.length === 0) {
		return {
			totalDays: 0,
			activeDays: 0,
			gapDays: 0,
			coveragePercent: 0,
			periods: []
		}
	}

	const dates = validTracks.map(t => new Date(t.date))
	const minTs = Math.min(...dates.map(d => d.getTime()))
	const maxTs = Math.max(...dates.map(d => d.getTime()))

	const getDayKeyUTC = (d: Date): string => d.toISOString().slice(0, 10)

	const startDayKey = getDayKeyUTC(new Date(minTs))
	const endDayKey = getDayKeyUTC(new Date(maxTs))

	const startDay = new Date(startDayKey + 'T00:00:00Z')
	const endDay = new Date(endDayKey + 'T00:00:00Z')

	const totalDays = Math.floor((endDay.getTime() - startDay.getTime()) / 86400000) + 1

	const dailyCounts: Map<string, number> = new Map()
	for (const track of validTracks) {
		const d = new Date(track.date)
		const key = getDayKeyUTC(d)
		dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1)
	}

	const dailyCountsArray: { date: Date; dayKey: string; count: number }[] = []
	let currentTs = startDay.getTime()
	while (currentTs <= endDay.getTime()) {
		const currentDate = new Date(currentTs)
		const key = getDayKeyUTC(currentDate)
		dailyCountsArray.push({
			date: currentDate,
			dayKey: key,
			count: dailyCounts.get(key) ?? 0
		})
		currentTs += 24 * 60 * 60 * 1000
	}

	const windowSize = 30
	const thresholdMultiplier = 0.1
	const minGapDays = 14

	const rollingBaselines: number[] = []
	for (let i = 0; i < dailyCountsArray.length; i++) {
		const windowStart = Math.max(0, i - windowSize)
		const windowEnd = Math.min(dailyCountsArray.length - 1, i + windowSize)
		const windowCounts = dailyCountsArray.slice(windowStart, windowEnd + 1).map(d => d.count)
		windowCounts.sort((a, b) => a - b)
		const median = windowCounts[Math.floor(windowCounts.length / 2)]
		rollingBaselines.push(median)
	}

	const isActive: boolean[] = dailyCountsArray.map((day, i) => {
		const baseline = rollingBaselines[i]
		const threshold = Math.max(2, baseline * thresholdMultiplier)
		return day.count >= threshold
	})

	// Build periods by scanning for changes in active state
	const periods: TrackingPeriod[] = []
	let periodStart = 0
	let periodIsActive = isActive[0]

	for (let i = 1; i <= isActive.length; i++) {
		const isLast = i === isActive.length
		const changed = !isLast && isActive[i] !== periodIsActive

		if (changed || isLast) {
			const periodEnd = isLast ? i - 1 : i - 1
			const dayCount = periodEnd - periodStart + 1
			const isGap = !periodIsActive && dayCount >= minGapDays

			periods.push({
				startDate: dailyCountsArray[periodStart].date,
				endDate: dailyCountsArray[periodEnd].date,
				dayCount,
				eventCount: dailyCountsArray.slice(periodStart, periodEnd + 1).reduce((sum, d) => sum + d.count, 0),
				isGap
			})

			if (changed) {
				periodStart = i
				periodIsActive = isActive[i]
			}
		}
	}

	// Merge short gaps into surrounding active periods
	const mergedPeriods = mergePeriods(periods, minGapDays)

	const activeDays = mergedPeriods.filter(p => !p.isGap).reduce((sum, p) => sum + p.dayCount, 0)
	const gapDays = mergedPeriods.filter(p => p.isGap).reduce((sum, p) => sum + p.dayCount, 0)

	return {
		totalDays,
		activeDays,
		gapDays,
		coveragePercent: totalDays > 0 ? (activeDays / totalDays) * 100 : 0,
		periods: mergedPeriods
	}
}

function mergePeriods (periods: TrackingPeriod[], minGapDays: number): TrackingPeriod[] {
	if (periods.length <= 1) { return periods }

	const merged: TrackingPeriod[] = []
	let current = { ...periods[0] }

	for (let i = 1; i < periods.length; i++) {
		const next = periods[i]

		if (current.isGap === next.isGap) {
			current.endDate = next.endDate
			current.dayCount += next.dayCount
			current.eventCount += next.eventCount
		} else if (next.isGap && next.dayCount < minGapDays) {
			current.endDate = next.endDate
			current.dayCount += next.dayCount
			current.eventCount += next.eventCount
		} else {
			merged.push(current)
			current = { ...next }
		}
	}
	merged.push(current)

	return merged
}

export function getActivePeriodTracks (tracks: Track[], coverage: CoverageStats): Track[] {
	const activePeriods = coverage.periods.filter(p => !p.isGap)

	return tracks.filter(track => {
		const date = new Date(track.date)
		if (isNaN(date.getTime())) { return false }

		return activePeriods.some(period => {
			const endExclusive = new Date(period.endDate.getTime() + 86400000)
			return date >= period.startDate && date < endExclusive
		})
	})
}
