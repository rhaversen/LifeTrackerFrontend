'use client'

import axios from 'axios'
import { useCallback, useEffect, useState, type ReactElement } from 'react'

import type { Track } from '@/types/Track'

const API_URL = process.env.NEXT_PUBLIC_API_URL

export default function TracksTab (): ReactElement {
	const [tracks, setTracks] = useState<Track[]>([])
	const [loading, setLoading] = useState(true)

	const fetchTracks = useCallback(async (): Promise<void> => {
		try {
			const response = await axios.get<Track[]>(`${API_URL}/v1/tracks`, { withCredentials: true })
			const sortedTracks = [...response.data]
				.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
				.slice(0, 100)
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

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-2xl font-bold text-gray-200">{'Latest Tracks'}</h2>
				<div className="text-gray-400 text-sm">
					{`Showing ${tracks.length} most recent tracks`}
				</div>
			</div>

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
						{tracks.map((track, index) => {
							const date = new Date(track.date)
							return (
								<tr key={track._id ?? index} className="hover:bg-gray-750">
									<td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-200">
										{track.trackName}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
										{date.toLocaleDateString('en-GB', {
											day: '2-digit',
											month: 'short',
											year: 'numeric'
										})}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
										{date.toLocaleTimeString('en-GB', {
											hour: '2-digit',
											minute: '2-digit',
											second: '2-digit'
										})}
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

				{tracks.length === 0 && (
					<div className="px-6 py-12 text-center text-gray-400">
						{'No tracks found'}
					</div>
				)}
			</div>
		</div>
	)
}
