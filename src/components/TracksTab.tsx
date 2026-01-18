'use client'

import axios from 'axios'
import { useCallback, useEffect, useState, type ReactElement } from 'react'

import type { Track } from '@/types/Track'

const API_URL = process.env.NEXT_PUBLIC_API_URL

export default function TracksTab (): ReactElement {
	const [tracks, setTracks] = useState<Track[]>([])
	const [loading, setLoading] = useState(true)
	const [showProblematic, setShowProblematic] = useState(false)

	const fetchTracks = useCallback(async (): Promise<void> => {
		try {
			const response = await axios.get<Track[]>(`${API_URL}/v1/tracks`, { withCredentials: true })
			const sortedTracks = [...response.data]
				.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
			setTracks(sortedTracks)
		} catch (error) {
			console.error('Failed to fetch tracks:', error)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchTracks().catch(console.error)
	}, [fetchTracks])

	const handleDelete = useCallback(async (trackId: string): Promise<void> => {
		if (!confirm('Are you sure you want to delete this track?')) {
			return
		}

		try {
			await axios.delete(`${API_URL}/v1/tracks/${trackId}`, {
				data: { confirm: true },
				withCredentials: true
			})
			setTracks(prev => prev.filter(t => t._id !== trackId))
		} catch (error) {
			console.error('Failed to delete track:', error)
			alert('Failed to delete track. Please try again.')
		}
	}, [])

	if (loading) {
		return (
			<div className="flex items-center justify-center py-20">
				<div className="text-gray-300 text-xl">{'Loading...'}</div>
			</div>
		)
	}

	const problematicTracks = tracks.filter(track => isNaN(new Date(track.date).getTime()))
	const validTracks = tracks.filter(track => !isNaN(new Date(track.date).getTime()))
	const displayTracks = showProblematic ? problematicTracks : validTracks.slice(0, 100)

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between flex-wrap gap-4">
				<h2 className="text-2xl font-bold text-gray-200">
					{showProblematic ? 'Problematic Tracks' : 'Latest Tracks'}
				</h2>
				<div className="flex items-center gap-4">
					{problematicTracks.length > 0 && (
						<button
							onClick={() => setShowProblematic(!showProblematic)}
							className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
								showProblematic
									? 'bg-red-600 text-white'
									: 'bg-gray-700 text-gray-300 hover:bg-gray-600'
							}`}
						>
							{showProblematic
								? `Show Valid Tracks`
								: `Show ${problematicTracks.length} Problematic Track${problematicTracks.length !== 1 ? 's' : ''}`}
						</button>
					)}
					<div className="text-gray-400 text-sm">
						{showProblematic
							? `${problematicTracks.length} problematic track${problematicTracks.length !== 1 ? 's' : ''}`
							: `Showing ${Math.min(validTracks.length, 100)} of ${validTracks.length} valid tracks`}
					</div>
				</div>
			</div>

			{showProblematic && problematicTracks.length > 0 && (
				<div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
					<p className="text-red-300 text-sm">
						<span className="font-bold">{'Warning: '}</span>
						{'These tracks have invalid dates and will not appear in visualizations. You can delete them to clean up your data.'}
					</p>
				</div>
			)}

			<div className="bg-gray-800 rounded-lg overflow-hidden">
				<table className="w-full">
					<thead className="bg-gray-700">
						<tr>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
								{'Track Name'}
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
								{'Date'}
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
								{'Time'}
							</th>
							<th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
								{'Actions'}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-700">
						{displayTracks.map((track, index) => {
							const date = new Date(track.date)
							const isInvalid = isNaN(date.getTime())
							return (
								<tr key={track._id ?? index} className={`hover:bg-gray-750 ${isInvalid ? 'bg-red-900/10' : ''}`}>
									<td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-200">
										{track.trackName}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
										{isInvalid ? (
											<span className="text-red-400 font-mono">{String(track.date)}</span>
										) : (
											date.toLocaleDateString('en-GB', {
												day: '2-digit',
												month: 'short',
												year: 'numeric'
											})
										)}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
										{isInvalid ? (
											<span className="text-red-400">{'Invalid Date'}</span>
										) : (
											date.toLocaleTimeString('en-GB', {
												hour: '2-digit',
												minute: '2-digit',
												second: '2-digit'
											})
										)}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-right text-sm">
										<button
											onClick={() => handleDelete(track._id!)}
											className="text-red-400 hover:text-red-300 font-medium transition-colors"
										>
											{'Delete'}
										</button>
									</td>
								</tr>
							)
						})}
					</tbody>
				</table>

				{displayTracks.length === 0 && (
					<div className="px-6 py-12 text-center text-gray-400">
						{showProblematic ? 'No problematic tracks found' : 'No tracks found'}
					</div>
				)}
			</div>
		</div>
	)
}
