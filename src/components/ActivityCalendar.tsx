'use client'

import type { ReactElement } from 'react'

import type { CoverageStats } from '../types/Insights'
import type { Track } from '../types/Track'

interface ActivityCalendarProps {
	tracks: Track[]
	coverage?: CoverageStats
}

function getTrackColor (trackName: string): string {
	// Generate consistent color from track name hash
	let hash = 0
	for (let i = 0; i < trackName.length; i++) {
		hash = trackName.charCodeAt(i) + ((hash << 5) - hash)
	}

	const hue = Math.abs(hash % 360)
	return `hsl(${hue}, 70%, 50%)`
}

function mixColors (colors: string[]): string {
	if (colors.length === 0) { return '#1f2937' } // gray-800
	if (colors.length === 1) { return colors[0] }

	// For multiple colors, create a linear gradient
	const stops = colors.map((color, idx) => {
		const percent = (idx / colors.length) * 100
		return `${color} ${percent}%`
	}).join(', ')

	return `linear-gradient(135deg, ${stops})`
}

function parseLocalDate (dateStr: string): Date {
	const d = new Date(dateStr)
	return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function toDateKey (d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ActivityCalendar ({ tracks, coverage }: ActivityCalendarProps): ReactElement {
	const validTracks = tracks.filter(t => !isNaN(new Date(t.date).getTime()))

	if (validTracks.length === 0) {
		return (
			<div className="text-gray-500 text-center py-8">{'No tracking data'}</div>
		)
	}

	const dates = validTracks.map(t => parseLocalDate(t.date))
	const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
	const today = new Date()
	const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
	const maxDate = new Date(Math.min(Math.max(...dates.map(d => d.getTime())), todayMidnight.getTime()))

	// Build gap periods map for easy lookup
	const gapMap = new Map<string, boolean>()
	if (coverage) {
		for (const period of coverage.periods) {
			if (period.isGap) {
				const current = new Date(period.startDate.getFullYear(), period.startDate.getMonth(), period.startDate.getDate())
				const end = new Date(period.endDate.getFullYear(), period.endDate.getMonth(), period.endDate.getDate())
				while (current <= end) {
					gapMap.set(toDateKey(current), true)
					current.setDate(current.getDate() + 1)
				}
			}
		}
	}

	// Start from the first Monday before or on minDate
	const startDate = new Date(minDate)
	const daysBeforeMinDate = startDate.getDay() // 0 = Sunday, 1 = Monday, etc.
	startDate.setDate(startDate.getDate() - daysBeforeMinDate)

	// End on maxDate (don't extend to end of week to avoid showing future dates)
	const endDate = new Date(maxDate)

	// Build map of day -> track types
	const dayMap = new Map<string, Set<string>>()
	for (const track of validTracks) {
		const d = parseLocalDate(track.date)
		const key = toDateKey(d)
		if (!dayMap.has(key)) {
			dayMap.set(key, new Set())
		}
		dayMap.get(key)!.add(track.trackName)
	}

	// Get all unique track types
	const trackTypes = [...new Set(validTracks.map(t => t.trackName))].sort()
	const trackColorMap = new Map<string, string>()
	for (const type of trackTypes) {
		trackColorMap.set(type, getTrackColor(type))
	}

	// Generate weeks (only up to maxDate, don't extend beyond)
	const weeks: Date[][] = []
	let currentWeek: Date[] = []
	const current = new Date(startDate)

	while (current <= endDate) {
		if (current <= maxDate) {
			currentWeek.push(new Date(current))
		}

		if (current.getDay() === 6) {
			if (currentWeek.length > 0) {
				weeks.push(currentWeek)
				currentWeek = []
			}
		}

		current.setDate(current.getDate() + 1)
	}

	if (currentWeek.length > 0) {
		weeks.push(currentWeek)
	}

	// Calculate coverage status for each week
	const weekCoverageStatus: boolean[] = weeks.map(week => {
		let gapDays = 0
		let totalValidDays = 0
		for (const day of week) {
			if (day.getTime() >= minDate.getTime() && day.getTime() <= maxDate.getTime()) {
				totalValidDays++
				if (gapMap.get(toDateKey(day)) === true) {
					gapDays++
				}
			}
		}
		return totalValidDays > 0 && gapDays < totalValidDays / 2
	})

	// Get months and years for labels - use absolute positioning
	const monthLabels: { month: string; weekIndex: number }[] = []
	const yearLabels: { year: number; weekIndex: number }[] = []
	let lastMonth = -1
	let lastYear = -1

	weeks.forEach((week, idx) => {
		if (week.length === 0) { return }
		const firstDayOfWeek = week[0]
		const month = firstDayOfWeek.getMonth()
		const year = firstDayOfWeek.getFullYear()

		if (year !== lastYear) {
			yearLabels.push({
				year,
				weekIndex: idx
			})
			lastYear = year
		}

		if (month !== lastMonth) {
			monthLabels.push({
				month: firstDayOfWeek.toLocaleDateString('en-US', { month: 'short' }),
				weekIndex: idx
			})
			lastMonth = month
		}
	})

	return (
		<div>
			<div className="flex items-center justify-between mb-4">
				<div className="flex items-center gap-2">
					<span className="text-2xl">{'📅'}</span>
					<span className="text-lg font-medium text-gray-200">{'Activity Calendar'}</span>
				</div>
				{coverage && (
					<div className="flex items-center gap-4 text-sm">
						<div className="flex items-center gap-1.5">
							<div className="w-3 h-3 bg-green-700 rounded-sm" />
							<span className="text-gray-400">{`Active (${coverage.coveragePercent.toFixed(0)}%)`}</span>
						</div>
						<div className="flex items-center gap-1.5">
							<div className="w-3 h-3 bg-red-900 rounded-sm" />
							<span className="text-gray-400">{`Gaps (${coverage.gapDays} days)`}</span>
						</div>
					</div>
				)}
			</div>

			<div className="overflow-x-auto">
				<div className="inline-block min-w-full">
					{/* Year labels */}
					<div className="relative h-5 mb-1 ml-7">
						{yearLabels.map((label, idx) => (
							<div
								key={idx}
								className="absolute text-sm font-bold text-gray-300"
								style={{ left: `${label.weekIndex * 16}px` }}
							>
								{label.year}
							</div>
						))}
					</div>

					{/* Month labels */}
					<div className="relative h-4 mb-2 ml-7">
						{monthLabels.map((label, idx) => (
							<div
								key={idx}
								className="absolute text-xs text-gray-500"
								style={{ left: `${label.weekIndex * 16}px` }}
							>
								{label.month}
							</div>
						))}
					</div>

					{/* Calendar grid */}
					<div className="flex gap-1">
						{/* Day labels */}
						<div className="flex flex-col gap-1 text-xs text-gray-500 pr-2">
							<div className="h-3">{'Mon'}</div>
							<div className="h-3" />
							<div className="h-3">{'Wed'}</div>
							<div className="h-3" />
							<div className="h-3">{'Fri'}</div>
							<div className="h-3" />
							<div className="h-3">{'Sun'}</div>
							{coverage && <div className="h-2" />}
						</div>

						{/* Weeks */}
						{weeks.map((week, weekIdx) => (
							<div key={weekIdx} className="flex flex-col gap-1">
								{week.map((day, dayIdx) => {
									if (day.getTime() > maxDate.getTime()) {
										return <div key={dayIdx} className="w-3 h-3" />
									}

									const key = toDateKey(day)
									const tracksOnDay = dayMap.get(key)
									const hasActivity = tracksOnDay !== undefined && tracksOnDay.size > 0

									let background = '#1f2937' // gray-800 default
									if (hasActivity === true) {
										const colors = [...tracksOnDay].map(t => trackColorMap.get(t)!)
										background = mixColors(colors)
									}

									const isToday =
										day.getDate() === new Date().getDate() &&
										day.getMonth() === new Date().getMonth() &&
										day.getFullYear() === new Date().getFullYear()

									return (
										<DayCell
											key={dayIdx}
											background={background}
											isToday={isToday}
											date={day}
											tracks={tracksOnDay ? [...tracksOnDay].sort() : []}
										/>
									)
								})}
								{/* Pad incomplete weeks with empty cells */}
								{Array.from({ length: 7 - week.length }).map((_, idx) => (
									<div key={`empty-${idx}`} className="w-3 h-3" />
								))}
								{coverage && (
									<div className="mt-1 mb-2">
										<div
											className={`w-3 h-2 rounded-sm ${weekCoverageStatus[weekIdx] ? 'bg-green-700' : 'bg-red-900'}`}
											title={weekCoverageStatus[weekIdx] ? 'Active tracking week' : 'Gap week'}
										/>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Legend */}
			<div className="mt-6 pt-4 border-t border-gray-700">
				<div className="text-xs text-gray-500 mb-2">{'Track Types:'}</div>
				<div className="flex flex-wrap gap-2">
					{trackTypes.map(type => (
						<div key={type} className="flex items-center gap-2">
							<div
								className="w-3 h-3 rounded"
								style={{ backgroundColor: trackColorMap.get(type) }}
							/>
							<span className="text-xs text-gray-400">{type}</span>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

interface DayCellProps {
	background: string
	isToday: boolean
	date: Date
	tracks: string[]
}

function DayCell ({ background, isToday, date, tracks }: DayCellProps): ReactElement {
	const isGradient = background.startsWith('linear-gradient')
	const title = `${date.toLocaleDateString()}\n${tracks.length > 0 ? tracks.join(', ') : 'No activity'}`

	return (
		<div
			className={`w-3 h-3 rounded-sm ${isToday ? 'ring-2 ring-blue-400' : ''}`}
			style={isGradient ? { background } : { backgroundColor: background }}
			title={title}
		/>
	)
}
