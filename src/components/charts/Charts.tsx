'use client'

import {
	ArcElement,
	CategoryScale,
	Chart as ChartJS,
	Filler,
	Legend,
	LinearScale,
	LineController,
	LineElement,
	LogarithmicScale,
	PointElement,
	PolarAreaController,
	RadarController,
	RadialLinearScale,
	ScatterController,
	TimeScale,
	Title,
	Tooltip
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { useEffect, useRef, type ReactElement } from 'react'

ChartJS.register(
	ArcElement,
	CategoryScale,
	LinearScale,
	LineController,
	LogarithmicScale,
	PolarAreaController,
	RadarController,
	RadialLinearScale,
	ScatterController,
	TimeScale,
	PointElement,
	LineElement,
	Filler,
	Title,
	Tooltip,
	Legend
)

interface BaseChartProps {
	title: string
	className?: string
}

interface LineScatterChartProps extends BaseChartProps {
	lineData: { x: Date, y: number }[]
	scatterData: { x: Date, y: number }[]
	lineLabel: string
	scatterLabel: string
	yAxisLabel: string
	logScale?: boolean
	useSingleAxis?: boolean
}

export function LineScatterChart ({
	title,
	lineData,
	scatterData,
	lineLabel,
	scatterLabel,
	yAxisLabel,
	logScale = false,
	useSingleAxis = false,
	className = ''
}: LineScatterChartProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const chartRef = useRef<ChartJS | null>(null)

	useEffect(() => {
		if (!canvasRef.current) {
			return
		}

		if (chartRef.current) {
			chartRef.current.destroy()
		}

		const ctx = canvasRef.current.getContext('2d')
		if (!ctx) {
			return
		}

		const lineDataTimestamp = lineData.map(d => ({ x: d.x.getTime(), y: d.y }))
		const scatterDataTimestamp = scatterData.map(d => ({ x: d.x.getTime(), y: d.y }))

		chartRef.current = new ChartJS(ctx, {
			type: 'scatter',
			data: {
				datasets: [
					{
						type: 'line',
						label: lineLabel,
						data: lineDataTimestamp,
						borderColor: 'rgba(59, 130, 246, 1)',
						backgroundColor: 'rgba(59, 130, 246, 0.1)',
						fill: true,
						tension: 0.1,
						pointRadius: 0,
						yAxisID: useSingleAxis ? 'yLeft' : 'yRight'
					},
					{
						type: 'scatter',
						label: scatterLabel,
						data: scatterDataTimestamp,
						backgroundColor: 'rgba(59, 130, 246, 0.6)',
						pointRadius: 2,
						yAxisID: 'yLeft'
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					title: { display: true, text: title, color: '#e5e7eb' },
					legend: { labels: { color: '#e5e7eb' } }
				},
				scales: {
					x: {
						type: 'time',
						time: { unit: 'day' },
						ticks: { color: '#9ca3af' },
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					},
					yLeft: {
						type: logScale ? 'logarithmic' : 'linear',
						position: 'left',
						title: { display: true, text: yAxisLabel, color: '#e5e7eb' },
						ticks: { color: '#9ca3af' },
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					},
					...(useSingleAxis ? {} : {
						yRight: {
							type: 'linear',
							position: 'right',
							title: { display: true, text: lineLabel, color: '#e5e7eb' },
							ticks: { color: '#9ca3af' },
							grid: { color: 'rgba(75, 85, 99, 0.3)' }
						}
					})
				}
			}
		})

		return () => {
			chartRef.current?.destroy()
		}
	}, [lineData, scatterData, lineLabel, scatterLabel, yAxisLabel, logScale, useSingleAxis, title])

	return (
		<div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
			<canvas ref={canvasRef} />
		</div>
	)
}

interface TimeOfDayScatterProps extends BaseChartProps {
	data: { x: Date, y: number }[]
}

export function TimeOfDayScatter ({ title, data, className = '' }: TimeOfDayScatterProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const chartRef = useRef<ChartJS | null>(null)

	useEffect(() => {
		if (!canvasRef.current) {
			return
		}

		if (chartRef.current) {
			chartRef.current.destroy()
		}

		const ctx = canvasRef.current.getContext('2d')
		if (!ctx) {
			return
		}

		const dataTimestamp = data.map(d => ({ x: d.x.getTime(), y: d.y }))

		chartRef.current = new ChartJS(ctx, {
			type: 'scatter',
			data: {
				datasets: [{
					label: 'Time of Day',
					data: dataTimestamp,
					backgroundColor: 'rgba(59, 130, 246, 0.6)',
					pointRadius: 2
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					title: { display: true, text: title, color: '#e5e7eb' },
					legend: { labels: { color: '#e5e7eb' } }
				},
				scales: {
					x: {
						type: 'time',
						time: { unit: 'day' },
						ticks: { color: '#9ca3af' },
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					},
					y: {
						min: 0,
						max: 24,
						title: { display: true, text: 'Hour of Day', color: '#e5e7eb' },
						ticks: {
							color: '#9ca3af',
							stepSize: 4,
							callback: (value) => `${value}:00`
						},
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					}
				}
			}
		})

		return () => {
			chartRef.current?.destroy()
		}
	}, [data, title])

	return (
		<div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
			<canvas ref={canvasRef} />
		</div>
	)
}

interface PolarChartProps extends BaseChartProps {
	data: number[]
	labels: string[]
}

export function PolarChart ({ title, data, labels, className = '' }: PolarChartProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const chartRef = useRef<ChartJS | null>(null)

	useEffect(() => {
		if (!canvasRef.current) {
			return
		}

		if (chartRef.current) {
			chartRef.current.destroy()
		}

		const ctx = canvasRef.current.getContext('2d')
		if (!ctx) {
			return
		}

		chartRef.current = new ChartJS(ctx, {
			type: 'radar',
			data: {
				labels,
				datasets: [{
					data,
					backgroundColor: 'rgba(59, 130, 246, 0.1)',
					borderColor: 'rgba(59, 130, 246, 1)',
					borderWidth: 2,
					pointBackgroundColor: 'rgba(59, 130, 246, 1)',
					pointBorderColor: 'rgba(59, 130, 246, 1)',
					pointRadius: 2
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					title: { display: true, text: title, color: '#e5e7eb' },
					legend: { display: false }
				},
				scales: {
					r: {
						beginAtZero: true,
						min: 0,
						ticks: { color: '#9ca3af', backdropColor: 'transparent' },
						grid: { color: 'rgba(75, 85, 99, 0.3)' },
						angleLines: { color: 'rgba(75, 85, 99, 0.3)' },
						pointLabels: { color: '#e5e7eb', font: { size: 11 } }
					}
				}
			}
		})

		return () => {
			chartRef.current?.destroy()
		}
	}, [data, labels, title])

	return (
		<div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
			<canvas ref={canvasRef} />
		</div>
	)
}

interface WeekdayScatterProps extends BaseChartProps {
	data: { x: number, y: number }[]
	logScale?: boolean
}

export function WeekdayScatter ({ title, data, logScale = false, className = '' }: WeekdayScatterProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const chartRef = useRef<ChartJS | null>(null)

	useEffect(() => {
		if (!canvasRef.current) {
			return
		}

		if (chartRef.current) {
			chartRef.current.destroy()
		}

		const ctx = canvasRef.current.getContext('2d')
		if (!ctx) {
			return
		}

		const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

		chartRef.current = new ChartJS(ctx, {
			type: 'scatter',
			data: {
				datasets: [{
					label: 'Delta Days',
					data,
					backgroundColor: 'rgba(59, 130, 246, 0.6)',
					pointRadius: 2
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					title: { display: true, text: title, color: '#e5e7eb' },
					legend: { labels: { color: '#e5e7eb' } }
				},
				scales: {
					x: {
						min: 0,
						max: 7,
						title: { display: true, text: 'Day of Week', color: '#e5e7eb' },
						ticks: {
							color: '#9ca3af',
							stepSize: 1,
							callback: (value) => days[Math.floor(Number(value)) % 7] || ''
						},
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					},
					y: {
						type: logScale ? 'logarithmic' : 'linear',
						title: { display: true, text: 'Delta Days', color: '#e5e7eb' },
						ticks: { color: '#9ca3af' },
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					}
				}
			}
		})

		return () => {
			chartRef.current?.destroy()
		}
	}, [data, title, logScale])

	return (
		<div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
			<canvas ref={canvasRef} />
		</div>
	)
}

interface HeatmapChartProps extends BaseChartProps {
	data: number[][]
	xLabels: string[]
	yLabels: string[]
}

export function HeatmapChart ({ title, data, xLabels, yLabels, className = '' }: HeatmapChartProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		if (!canvasRef.current) {
			return
		}

		const ctx = canvasRef.current.getContext('2d')
		if (!ctx) {
			return
		}

		const canvas = canvasRef.current
		const width = canvas.width = canvas.offsetWidth * 2
		const height = canvas.height = canvas.offsetHeight * 2
		ctx.scale(2, 2)

		const padding = { top: 40, right: 20, bottom: 40, left: 50 }
		const cellWidth = (width / 2 - padding.left - padding.right) / xLabels.length
		const cellHeight = (height / 2 - padding.top - padding.bottom) / yLabels.length

		const maxVal = Math.max(...data.flat(), 1)

		ctx.fillStyle = '#1f2937'
		ctx.fillRect(0, 0, width / 2, height / 2)

		ctx.fillStyle = '#e5e7eb'
		ctx.font = '14px sans-serif'
		ctx.textAlign = 'center'
		ctx.fillText(title, width / 4, 20)

		data.forEach((row, yi) => {
			row.forEach((value, xi) => {
				const intensity = value / maxVal
				const hue = 200
				const saturation = 70
				const lightness = 90 - intensity * 60

				ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`
				ctx.fillRect(
					padding.left + xi * cellWidth,
					padding.top + yi * cellHeight,
					cellWidth - 1,
					cellHeight - 1
				)
			})
		})

		ctx.fillStyle = '#9ca3af'
		ctx.font = '10px sans-serif'
		ctx.textAlign = 'center'
		xLabels.forEach((label, i) => {
			ctx.fillText(label, padding.left + i * cellWidth + cellWidth / 2, height / 2 - padding.bottom + 15)
		})

		ctx.textAlign = 'right'
		yLabels.forEach((label, i) => {
			ctx.fillText(label, padding.left - 5, padding.top + i * cellHeight + cellHeight / 2 + 4)
		})
	}, [data, xLabels, yLabels, title])

	return (
		<div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
			<canvas ref={canvasRef} className="w-full h-full" />
		</div>
	)
}

interface DeltaByTimeScatterProps extends BaseChartProps {
	data: { x: number, y: number }[]
	logScale?: boolean
}

export function DeltaByTimeScatter ({ title, data, logScale = false, className = '' }: DeltaByTimeScatterProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const chartRef = useRef<ChartJS | null>(null)

	useEffect(() => {
		if (!canvasRef.current) {
			return
		}

		if (chartRef.current) {
			chartRef.current.destroy()
		}

		const ctx = canvasRef.current.getContext('2d')
		if (!ctx) {
			return
		}

		chartRef.current = new ChartJS(ctx, {
			type: 'scatter',
			data: {
				datasets: [{
					label: 'Delta Days',
					data,
					backgroundColor: 'rgba(59, 130, 246, 0.6)',
					pointRadius: 2
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					title: { display: true, text: title, color: '#e5e7eb' },
					legend: { labels: { color: '#e5e7eb' } }
				},
				scales: {
					x: {
						min: 0,
						max: 24,
						title: { display: true, text: 'Hour of Day', color: '#e5e7eb' },
						ticks: {
							color: '#9ca3af',
							stepSize: 4,
							callback: (value) => `${value}:00`
						},
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					},
					y: {
						type: logScale ? 'logarithmic' : 'linear',
						title: { display: true, text: 'Delta Days', color: '#e5e7eb' },
						ticks: { color: '#9ca3af' },
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					}
				}
			}
		})

		return () => {
			chartRef.current?.destroy()
		}
	}, [data, title, logScale])

	return (
		<div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
			<canvas ref={canvasRef} />
		</div>
	)
}
