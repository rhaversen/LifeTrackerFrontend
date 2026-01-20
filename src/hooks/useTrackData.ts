import { useMemo } from 'react'

import type { CoverageStats } from '@/types/Insights'
import type { ProcessedTrack, Track } from '@/types/Track'

function isInGap (date: Date, coverage?: CoverageStats): boolean {
	if (!coverage) { return false }
	const gapPeriods = coverage.periods.filter(p => p.isGap)
	return gapPeriods.some(period => {
		const endExclusive = new Date(period.endDate.getTime() + 86400000)
		return date >= period.startDate && date < endExclusive
	})
}

export function useProcessedTracks (tracks: Track[], coverage?: CoverageStats): ProcessedTrack[] {
	return useMemo(() => {
		const sorted = [...tracks]
			.filter(track => {
				const date = new Date(track.date)
				return !isNaN(date.getTime())
			})
			.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

		return sorted.map((track, index) => {
			const dateObj = new Date(track.date)
			const prevTrack = index > 0 ? sorted[index - 1] : null

			// Don't calculate delta days if either track is in a gap or if crossing a gap boundary
			let deltaDays: number | null = null
			if (prevTrack && !isInGap(dateObj, coverage) && !isInGap(new Date(prevTrack.date), coverage)) {
				const deltaMs = dateObj.getTime() - new Date(prevTrack.date).getTime()
				const days = deltaMs / (1000 * 60 * 60 * 24)
				// Also check if there's a gap period between the two tracks
				if (coverage) {
					const hasGapBetween = coverage.periods.some(period => {
						if (!period.isGap) { return false }
						const prevDate = new Date(prevTrack.date)
						return period.startDate > prevDate && period.endDate < dateObj
					})
					if (!hasGapBetween) {
						deltaDays = days
					}
				} else {
					deltaDays = days
				}
			}

			return {
				...track,
				dateObj,
				dayOfWeek: (dateObj.getDay() + 6) % 7 + (dateObj.getHours() + dateObj.getMinutes() / 60) / 24,
				hourOfDay: dateObj.getHours() + dateObj.getMinutes() / 60,
				deltaDays
			}
		})
	}, [tracks, coverage])
}

export function useCumulativeData (tracks: ProcessedTrack[], coverage?: CoverageStats): Array<{ x: Date, y: number | null }> {
	return useMemo(() => {
		if (!coverage) {
			return tracks.map((_, index) => ({
				x: tracks[index].dateObj,
				y: index + 1
			}))
		}

		// Split cumulative counts by active periods, with nulls at gap boundaries
		const activePeriods = coverage.periods.filter(p => !p.isGap)
		const result: Array<{ x: Date, y: number | null }> = []

		for (let periodIdx = 0; periodIdx < activePeriods.length; periodIdx++) {
			const period = activePeriods[periodIdx]
			const periodTracks = tracks.filter(t => {
				const endExclusive = new Date(period.endDate.getTime() + 86400000)
				return t.dateObj >= period.startDate && t.dateObj < endExclusive
			})

			// Add null point at start of gap before this period (to break the line)
			if (periodIdx > 0) {
				const prevPeriod = activePeriods[periodIdx - 1]
				const gapStart = new Date(prevPeriod.endDate.getTime() + 86400000)
				result.push({ x: gapStart, y: null })
			}

			periodTracks.forEach((track, index) => {
				result.push({
					x: track.dateObj,
					y: index + 1
				})
			})

			// Add null point at end of this period if there's a gap after
			if (periodIdx < activePeriods.length - 1) {
				const gapStart = new Date(period.endDate.getTime() + 86400000)
				result.push({ x: gapStart, y: null })
			}
		}

		return result
	}, [tracks, coverage])
}

export function useDeltaDaysData (tracks: ProcessedTrack[]): { x: Date, y: number }[] {
	return useMemo(() => {
		// deltaDays are already filtered by coverage in useProcessedTracks
		return tracks
			.filter(t => t.deltaDays !== null)
			.map(t => ({
				x: t.dateObj,
				y: t.deltaDays!
			}))
	}, [tracks])
}

function calculateRollingAverage (values: number[], windowSize: number): number[] {
	const halfWindow = Math.floor(windowSize / 2)
	return values.map((_, i) => {
		const start = Math.max(0, i - halfWindow)
		const end = Math.min(values.length, i + halfWindow + 1)
		const window = values.slice(start, end)
		return window.reduce((a, b) => a + b, 0) / window.length
	})
}

export function useFrequencyData (tracks: ProcessedTrack[], coverage?: CoverageStats): {
	weeklyAvg: Array<{ x: Date, y: number | null }>
	monthlyAvg: Array<{ x: Date, y: number | null }>
} {
	return useMemo(() => {
		if (tracks.length === 0) {
			return { weeklyAvg: [], monthlyAvg: [] }
		}

		if (!coverage) {
			// Without coverage, use original logic
			const dailyCounts: Record<string, number> = {}
			tracks.forEach(t => {
				const dateKey = t.dateObj.toISOString().split('T')[0]
				dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1
			})

			const sortedDates = Object.keys(dailyCounts).sort()
			const counts = sortedDates.map(d => dailyCounts[d])

			const weeklyAvg = calculateRollingAverage(counts, 7)
			const monthlyAvg = calculateRollingAverage(counts, 30)

			return {
				weeklyAvg: sortedDates.map((date, i) => ({
					x: new Date(date),
					y: weeklyAvg[i]
				})),
				monthlyAvg: sortedDates.map((date, i) => ({
					x: new Date(date),
					y: monthlyAvg[i]
				}))
			}
		}

		// With coverage: include all days (active + gap), gaps have 0 counts
		const minDate = Math.min(...tracks.map(t => t.dateObj.getTime()))
		const maxDate = Math.max(...tracks.map(t => t.dateObj.getTime()))

		// Build daily counts for all days in range
		const dailyCountsArray: { date: Date, dateKey: string, count: number }[] = []
		const dailyCounts: Record<string, number> = {}

		// First, populate with track counts
		tracks.forEach(t => {
			const dateKey = t.dateObj.toISOString().split('T')[0]
			dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1
		})

		// Then fill in all days including gaps with 0
		const currentDate = new Date(minDate)
		const endDate = new Date(maxDate)
		while (currentDate <= endDate) {
			const dateKey = currentDate.toISOString().split('T')[0]
			const isInGapPeriod = isInGap(currentDate, coverage)
			dailyCountsArray.push({
				date: new Date(currentDate),
				dateKey,
				count: isInGapPeriod ? 0 : (dailyCounts[dateKey] || 0)
			})
			currentDate.setDate(currentDate.getDate() + 1)
		}

		const counts = dailyCountsArray.map(d => d.count)
		const weeklyAvg = calculateRollingAverage(counts, 7)
		const monthlyAvg = calculateRollingAverage(counts, 30)

		// Insert null values at gap boundaries to break the line
		const activePeriods = coverage.periods.filter(p => !p.isGap)
		const weeklyResult: Array<{ x: Date, y: number | null }> = []
		const monthlyResult: Array<{ x: Date, y: number | null }> = []

		for (let periodIdx = 0; periodIdx < activePeriods.length; periodIdx++) {
			const period = activePeriods[periodIdx]

			// Add null point at start of gap before this period (to break the line)
			if (periodIdx > 0) {
				const prevPeriod = activePeriods[periodIdx - 1]
				const gapStart = new Date(prevPeriod.endDate.getTime() + 86400000)
				weeklyResult.push({ x: gapStart, y: null })
				monthlyResult.push({ x: gapStart, y: null })
			}

			// Add data points for this active period
			dailyCountsArray.forEach((day, i) => {
				const endExclusive = new Date(period.endDate.getTime() + 86400000)
				if (day.date >= period.startDate && day.date < endExclusive) {
					weeklyResult.push({ x: day.date, y: weeklyAvg[i] })
					monthlyResult.push({ x: day.date, y: monthlyAvg[i] })
				}
			})

			// Add null point at end of this period if there's a gap after
			if (periodIdx < activePeriods.length - 1) {
				const gapStart = new Date(period.endDate.getTime() + 86400000)
				weeklyResult.push({ x: gapStart, y: null })
				monthlyResult.push({ x: gapStart, y: null })
			}
		}

		return {
			weeklyAvg: weeklyResult,
			monthlyAvg: monthlyResult
		}
	}, [tracks, coverage])
}

export function useTimeOfDayData (tracks: ProcessedTrack[], coverage?: CoverageStats): { x: Date, y: number }[] {
	return useMemo(() => {
		// Filter out tracks in gap periods
		const activeTracks = !coverage ? tracks : tracks.filter(t => !isInGap(t.dateObj, coverage))
		return activeTracks.map(t => ({
			x: t.dateObj,
			y: t.hourOfDay
		}))
	}, [tracks, coverage])
}

export function useHourlyDistribution (tracks: ProcessedTrack[]): { data: number[], labels: string[] } {
	return useMemo(() => {
		const hourCounts = new Array(24).fill(0)
		tracks.forEach(t => {
			hourCounts[Math.floor(t.hourOfDay)]++
		})

		return {
			data: hourCounts,
			labels: Array.from({ length: 24 }, (_, i) => `${i}:00`)
		}
	}, [tracks])
}

export function useWeekdayScatterData (tracks: ProcessedTrack[]): { x: number, y: number }[] {
	return useMemo(() => {
		// deltaDays are already filtered by coverage in useProcessedTracks
		return tracks
			.filter(t => t.deltaDays !== null)
			.map(t => ({
				x: t.dayOfWeek,
				y: t.deltaDays!
			}))
	}, [tracks])
}

export function useWeekdayDistribution (tracks: ProcessedTrack[]): { data: number[], labels: string[] } {
	return useMemo(() => {
		const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
		const dayCounts = new Array(7).fill(0)
		tracks.forEach(t => {
			const dayIndex = (t.dateObj.getDay() + 6) % 7
			dayCounts[dayIndex]++
		})

		return {
			data: dayCounts,
			labels: days
		}
	}, [tracks])
}

export function useWeekdayHeatmapData (tracks: ProcessedTrack[]): {
	data: number[][]
	xLabels: string[]
	yLabels: string[]
} {
	return useMemo(() => {
		const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
		const hours = Array.from({ length: 24 }, (_, i) => i)

		// Matrix: rows = hours (y-axis), columns = days (x-axis)
		const matrix: number[][] = hours.map(() => new Array(7).fill(0))

		tracks.forEach(t => {
			const dayIndex = (t.dateObj.getDay() + 6) % 7
			const hourIndex = Math.floor(t.hourOfDay)
			if (hourIndex >= 0 && hourIndex < 24) {
				matrix[hourIndex][dayIndex]++
			}
		})

		return {
			data: matrix,
			xLabels: days,
			yLabels: hours.map(h => `${h}:00`)
		}
	}, [tracks])
}

export function useDeltaByTimeData (tracks: ProcessedTrack[]): { x: number, y: number }[] {
	return useMemo(() => {
		// deltaDays are already filtered by coverage in useProcessedTracks
		return tracks
			.filter(t => t.deltaDays !== null)
			.map(t => ({
				x: t.hourOfDay,
				y: t.deltaDays!
			}))
	}, [tracks])
}

export function useCalendarHeatmapData (tracks: ProcessedTrack[]): {
	data: Map<string, number>
	yearRange: { start: number, end: number }
	dateRange: { start: Date, end: Date }
} {
	return useMemo(() => {
		const data = new Map<string, number>()
		const today = new Date()
		today.setHours(0, 0, 0, 0)
		const currentYear = today.getFullYear()

		if (tracks.length === 0) {
			return {
				data,
				yearRange: { start: currentYear, end: currentYear },
				dateRange: { start: today, end: today }
			}
		}

		let minDate = new Date(tracks[0].dateObj)
		let maxDate = new Date(tracks[0].dateObj)
		let minYear = minDate.getFullYear()
		let maxYear = maxDate.getFullYear()

		tracks.forEach(t => {
			const dateKey = t.dateObj.toISOString().split('T')[0]
			data.set(dateKey, (data.get(dateKey) ?? 0) + 1)
			const year = t.dateObj.getFullYear()
			minYear = Math.min(minYear, year)
			maxYear = Math.max(maxYear, year)

			const trackDate = new Date(t.dateObj)
			trackDate.setHours(0, 0, 0, 0)
			if (trackDate < minDate) { minDate = trackDate }
			if (trackDate > maxDate) { maxDate = trackDate }
		})

		// Cap maxDate and maxYear at today (don't show future)
		if (maxDate > today) { maxDate = today }
		maxYear = Math.min(maxYear, currentYear)

		return {
			data,
			yearRange: { start: minYear, end: maxYear },
			dateRange: { start: minDate, end: maxDate }
		}
	}, [tracks])
}

export function useGapHistogramData (tracks: ProcessedTrack[]): {
	bins: number[]
	labels: string[]
	maxGap: number
} {
	return useMemo(() => {
		// deltaDays are already filtered to exclude large coverage gaps
		const gaps = tracks
			.filter(t => t.deltaDays !== null && t.deltaDays > 0)
			.map(t => t.deltaDays!)

		if (gaps.length === 0) {
			return { bins: [], labels: [], maxGap: 0 }
		}

		const maxGap = Math.max(...gaps)
		const binCount = Math.min(Math.ceil(maxGap), 20)
		const binSize = maxGap / binCount

		const bins = new Array(binCount).fill(0)
		gaps.forEach(gap => {
			const binIndex = Math.min(Math.floor(gap / binSize), binCount - 1)
			bins[binIndex]++
		})

		const labels = bins.map((_, i) => {
			const start = (i * binSize).toFixed(1)
			const end = ((i + 1) * binSize).toFixed(1)
			return `${start}-${end}`
		})

		return { bins, labels, maxGap }
	}, [tracks])
}

export interface BoxPlotStats {
	min: number
	q1: number
	median: number
	q3: number
	max: number
	outliers: number[]
}

function calculateBoxPlotStats (values: number[]): BoxPlotStats | null {
	if (values.length === 0) { return null }

	const sorted = [...values].sort((a, b) => a - b)
	const q1Index = Math.floor(sorted.length * 0.25)
	const medianIndex = Math.floor(sorted.length * 0.5)
	const q3Index = Math.floor(sorted.length * 0.75)

	const q1 = sorted[q1Index]
	const median = sorted[medianIndex]
	const q3 = sorted[q3Index]
	const iqr = q3 - q1
	const lowerFence = q1 - 1.5 * iqr
	const upperFence = q3 + 1.5 * iqr

	const outliers = sorted.filter(v => v < lowerFence || v > upperFence)
	const nonOutliers = sorted.filter(v => v >= lowerFence && v <= upperFence)

	return {
		min: nonOutliers.length > 0 ? nonOutliers[0] : sorted[0],
		q1,
		median,
		q3,
		max: nonOutliers.length > 0 ? nonOutliers[nonOutliers.length - 1] : sorted[sorted.length - 1],
		outliers
	}
}

export function useWeekdayBoxPlotData (tracks: ProcessedTrack[]): {
	stats: (BoxPlotStats | null)[]
	labels: string[]
} {
	return useMemo(() => {
		const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
		const dayGaps: number[][] = Array.from({ length: 7 }, () => [])

		tracks.forEach(t => {
			if (t.deltaDays !== null && t.deltaDays > 0) {
				const dayIndex = (t.dateObj.getDay() + 6) % 7
				dayGaps[dayIndex].push(t.deltaDays)
			}
		})

		return {
			stats: dayGaps.map(gaps => calculateBoxPlotStats(gaps)),
			labels: days
		}
	}, [tracks])
}

export function useMonthlyBoxPlotData (tracks: ProcessedTrack[]): {
	stats: (BoxPlotStats | null)[]
	labels: string[]
} {
	return useMemo(() => {
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
		const monthGaps: number[][] = Array.from({ length: 12 }, () => [])

		tracks.forEach(t => {
			if (t.deltaDays !== null && t.deltaDays > 0) {
				const monthIndex = t.dateObj.getMonth()
				monthGaps[monthIndex].push(t.deltaDays)
			}
		})

		return {
			stats: monthGaps.map(gaps => calculateBoxPlotStats(gaps)),
			labels: months
		}
	}, [tracks])
}
