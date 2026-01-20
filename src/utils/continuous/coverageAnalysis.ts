import type { CoverageStats, TrackingPeriod } from '../../types/Insights'
import type { Track } from '../../types/Track'

function computeDeltaStatistics (sortedTracks: Track[]): { mean: number, stdDev: number, q95: number } {
	if (sortedTracks.length < 2) {
		return { mean: 0, stdDev: 0, q95: 0 }
	}

	const deltas: number[] = []
	for (let i = 1; i < sortedTracks.length; i++) {
		const prev = new Date(sortedTracks[i - 1].date).getTime()
		const curr = new Date(sortedTracks[i].date).getTime()
		const deltaDays = (curr - prev) / (1000 * 60 * 60 * 24)
		if (deltaDays > 0) {
			deltas.push(deltaDays)
		}
	}

	if (deltas.length === 0) {
		return { mean: 0, stdDev: 0, q95: 0 }
	}

	const mean = deltas.reduce((sum, d) => sum + d, 0) / deltas.length
	const variance = deltas.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / deltas.length
	const stdDev = Math.sqrt(variance)

	const sortedDeltas = [...deltas].sort((a, b) => a - b)
	const q95Index = Math.floor(sortedDeltas.length * 0.95)
	const q95 = sortedDeltas[q95Index]

	return { mean, stdDev, q95 }
}

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

	const sortedTracks = [...validTracks].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
	const dates = sortedTracks.map(t => new Date(t.date))
	const minTs = dates[0].getTime()
	const maxTs = dates[dates.length - 1].getTime()

	const totalDays = Math.floor((maxTs - minTs) / 86400000) + 1

	// Compute statistical outlier threshold for this track type
	const stats = computeDeltaStatistics(sortedTracks)

	// Use 3 standard deviations or 95th percentile (whichever is more conservative)
	// Also enforce a minimum of 7 days to avoid false positives on daily tracking
	const outlierThreshold = Math.max(7, Math.min(stats.mean + 7 * stats.stdDev, stats.q95 * 5))

	// Identify gap periods based on extreme delta outliers
	const periods: TrackingPeriod[] = []

	for (let i = 0; i < sortedTracks.length; i++) {
		const trackDate = new Date(sortedTracks[i].date)

		if (i === 0) {
			// First track starts an active period
			continue
		}

		const prevDate = new Date(sortedTracks[i - 1].date)
		const deltaDays = (trackDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)

		// If this delta is an extreme outlier, mark the gap
		if (deltaDays > outlierThreshold) {
			// Add active period before the gap (if not already added)
			if (periods.length === 0 || periods[periods.length - 1].isGap) {
				const activePeriodStart = periods.length === 0 ? dates[0] : new Date(periods[periods.length - 1].endDate.getTime() + 86400000)
				periods.push({
					startDate: activePeriodStart,
					endDate: prevDate,
					dayCount: Math.floor((prevDate.getTime() - activePeriodStart.getTime()) / 86400000) + 1,
					eventCount: sortedTracks.filter(t => {
						const d = new Date(t.date)
						return d >= activePeriodStart && d <= prevDate
					}).length,
					isGap: false
				})
			} else {
				// Update the end date of the last active period
				periods[periods.length - 1].endDate = prevDate
				periods[periods.length - 1].dayCount = Math.floor((prevDate.getTime() - periods[periods.length - 1].startDate.getTime()) / 86400000) + 1
				periods[periods.length - 1].eventCount = sortedTracks.filter(t => {
					const d = new Date(t.date)
					return d >= periods[periods.length - 1].startDate && d <= prevDate
				}).length
			}

			// Add the gap period
			const gapStart = new Date(prevDate.getTime() + 86400000)
			const gapEnd = new Date(trackDate.getTime() - 86400000)
			periods.push({
				startDate: gapStart,
				endDate: gapEnd,
				dayCount: Math.floor((gapEnd.getTime() - gapStart.getTime()) / 86400000) + 1,
				eventCount: 0,
				isGap: true
			})
		}
	}

	// Add final active period
	if (periods.length === 0) {
		// No gaps detected - entire range is active
		periods.push({
			startDate: dates[0],
			endDate: dates[dates.length - 1],
			dayCount: totalDays,
			eventCount: sortedTracks.length,
			isGap: false
		})
	} else if (periods[periods.length - 1].isGap) {
		// Last period was a gap, add final active period
		const lastGapEnd = periods[periods.length - 1].endDate
		const finalStart = new Date(lastGapEnd.getTime() + 86400000)
		periods.push({
			startDate: finalStart,
			endDate: dates[dates.length - 1],
			dayCount: Math.floor((dates[dates.length - 1].getTime() - finalStart.getTime()) / 86400000) + 1,
			eventCount: sortedTracks.filter(t => {
				const d = new Date(t.date)
				return d >= finalStart
			}).length,
			isGap: false
		})
	} else {
		// Extend last active period to the end
		periods[periods.length - 1].endDate = dates[dates.length - 1]
		periods[periods.length - 1].dayCount = Math.floor((dates[dates.length - 1].getTime() - periods[periods.length - 1].startDate.getTime()) / 86400000) + 1
		periods[periods.length - 1].eventCount = sortedTracks.filter(t => {
			const d = new Date(t.date)
			return d >= periods[periods.length - 1].startDate
		}).length
	}

	const activeDays = periods.filter(p => !p.isGap).reduce((sum, p) => sum + p.dayCount, 0)
	const gapDays = periods.filter(p => p.isGap).reduce((sum, p) => sum + p.dayCount, 0)

	return {
		totalDays,
		activeDays,
		gapDays,
		coveragePercent: totalDays > 0 ? (activeDays / totalDays) * 100 : 0,
		periods
	}
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
