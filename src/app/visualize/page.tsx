'use client'

import axios from 'axios'
import { type ChartDataset } from 'chart.js'
import Chart from 'chart.js/auto'
import React, { useEffect, useState } from 'react'

type ChartDatasetWithBackground = ChartDataset<'bar', number[]> & {
	backgroundColor: string
	borderColor: string
}

interface TrackingData {
	trackName: string
	date: string // ISO datetime format
}

type ChartDataStructure = Record<string, Record<string, number>>

const colors = [
	'rgba(255, 99, 132, 0.2)', // Red
	'rgba(54, 162, 235, 0.2)', // Blue
	'rgba(255, 206, 86, 0.2)', // Yellow
	'rgba(75, 192, 192, 0.2)', // Green
	'rgba(153, 102, 255, 0.2)', // Purple
	'rgba(255, 159, 64, 0.2)', // Orange
	'rgba(199, 199, 199, 0.2)' // Grey
	// Add more colors as needed
]
const API_URL = process.env.NEXT_PUBLIC_API_URL

const Page: React.FC = () => {
	const [chartData, setChartData] = useState<ChartDataStructure>({})
	const chartRef = React.useRef<Chart | null>(null)

	useEffect(() => {
		const fetchData = async (): Promise<void> => {
			try {
				const response = await axios.get(`${API_URL}/v1/tracks`, { withCredentials: true })
				const data: TrackingData[] = response.data
				const aggregatedData: ChartDataStructure = {}

				data.forEach(({ trackName, date }) => {
					const dateOnly = date.split('T')[0]
					if (aggregatedData[dateOnly] === undefined) { aggregatedData[dateOnly] = {} }
					if (aggregatedData[dateOnly][trackName] === undefined) { aggregatedData[dateOnly][trackName] = 0 }
					aggregatedData[dateOnly][trackName] += 1
				})

				setChartData(aggregatedData)
			} catch (error) {
				console.error('Failed to fetch tracking data:', error)
			}
		}

		fetchData().catch(console.error)
	}, [])

	useEffect(() => {
		if (Object.keys(chartData).length > 0) {
			const canvas = document.getElementById('myChart') as HTMLCanvasElement
			const ctx = canvas.getContext('2d')
			if (ctx !== null) {
				if (chartRef.current !== undefined && chartRef.current !== null) {
					chartRef.current.destroy()
				}

				const datasets: ChartDatasetWithBackground[] = [] // Explicitly typed
				const trackNames = Array.from(new Set(Object.values(chartData).flatMap(Object.keys)))
				const dates = Object.keys(chartData).sort()

				trackNames.forEach((trackName, index) => {
					const colorIndex = index % colors.length
					const backgroundColor = colors[colorIndex]
					const borderColor = backgroundColor.replace('0.2', '1')

					const data = dates.map(date => chartData[date][trackName] ?? 0)
					datasets.push({
						label: trackName,
						data,
						backgroundColor,
						borderColor,
						borderWidth: 1
					})
				})

				chartRef.current = new Chart(ctx, {
					type: 'bar',
					data: {
						labels: dates,
						datasets
					},
					options: {
						scales: {
							y: {
								beginAtZero: true
							}
						}
					}
				})
			} else {
				console.error('Failed to get the 2D context')
			}
		}
	}, [chartData])

	return (
		<div>
			<h1>{'User Tracking Data'}</h1>
			<canvas id="myChart"></canvas>
		</div>
	)
}

export default Page
