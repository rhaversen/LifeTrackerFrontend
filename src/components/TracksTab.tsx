'use client'

import axios from 'axios'
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'

import type { Track } from '@/types/Track'
import type { User } from '@/types/User'

const API_URL = process.env.NEXT_PUBLIC_API_URL

export default function TracksTab (): ReactElement {
	const [tracks, setTracks] = useState<Track[]>([])
	const [totalCount, setTotalCount] = useState(0)
	const [loading, setLoading] = useState(true)
	const [showProblematic, setShowProblematic] = useState(false)
	const [page, setPage] = useState(1)
	const [pageSize, setPageSize] = useState(100)
	const [sortField, setSortField] = useState<'date' | 'trackName'>('date')
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
	const [trackNames, setTrackNames] = useState<string[]>([])
	const [selectedTrackName, setSelectedTrackName] = useState<string>('All')
	const [translations, setTranslations] = useState<Record<string, string>>({})
	const [editingTranslation, setEditingTranslation] = useState<string | null>(null)
	const [savingTranslations, setSavingTranslations] = useState(false)
	const [editingTrackName, setEditingTrackName] = useState<Record<string, string>>({})
	const [renamingTrackName, setRenamingTrackName] = useState(false)
	const [editModeEnabled, setEditModeEnabled] = useState(false)
	const [trackManagementExpanded, setTrackManagementExpanded] = useState(false)

	const hasUnsavedChanges = useCallback((trackName: string): boolean => {
		const editedValue = editingTrackName[trackName]
		return editedValue !== undefined && editedValue !== trackName
	}, [editingTrackName])

	const enableEditMode = useCallback(() => {
		setEditModeEnabled(true)
	}, [])

	const disableEditMode = useCallback(() => {
		setEditModeEnabled(false)
		setEditingTrackName({})
	}, [])

	const fetchTracks = useCallback(async (): Promise<void> => {
		setLoading(true)
		try {
			const sortParam = sortField === 'date'
				? (sortDirection === 'asc' ? 'date' : '-date')
				: (sortDirection === 'asc' ? 'trackName' : '-trackName')

			const response = await axios.get<Track[]>(`${API_URL}/v1/tracks`, {
				withCredentials: true,
				params: {
					trackName: selectedTrackName === 'All' ? undefined : selectedTrackName,
					sort: sortParam,
					limit: pageSize,
					skip: (page - 1) * pageSize
				}
			})
			setTracks(response.data)

			if (page === 1) {
				const countResponse = await axios.get<Track[]>(`${API_URL}/v1/tracks`, {
					withCredentials: true,
					params: {
						trackName: selectedTrackName === 'All' ? undefined : selectedTrackName
					}
				})
				setTotalCount(countResponse.data.length)
			}
		} catch (error) {
			console.error('Failed to fetch tracks:', error)
		} finally {
			setLoading(false)
		}
	}, [sortField, sortDirection, page, pageSize, selectedTrackName])

	const fetchTrackNames = useCallback(async (): Promise<void> => {
		try {
			const response = await axios.get<Track[]>(`${API_URL}/v1/tracks`, {
				withCredentials: true
			})
			const allNames = [...new Set(response.data.map(t => t.trackName))].sort()
			setTrackNames(['All', ...allNames])
		} catch (error) {
			console.error('Failed to fetch track names:', error)
		}
	}, [])

	const fetchUser = useCallback(async (): Promise<void> => {
		try {
			const response = await axios.get<User>(`${API_URL}/v1/users/user`, {
				withCredentials: true
			})
			setTranslations(response.data.trackNameTranslations ?? {})
		} catch (error) {
			console.error('Failed to fetch user:', error)
		}
	}, [])

	const saveTranslations = useCallback(async (newTranslations: Record<string, string>): Promise<void> => {
		setSavingTranslations(true)
		try {
			await axios.patch(
				`${API_URL}/v1/users/track-name-translations`,
				{ translations: newTranslations },
				{ withCredentials: true }
			)
			setTranslations(newTranslations)
		} catch (error) {
			console.error('Failed to save translations:', error)
			alert('Failed to save translations. Please try again.')
		} finally {
			setSavingTranslations(false)
		}
	}, [])

	const getTranslatedName = useCallback((trackName: string): string => {
		return translations[trackName] ?? trackName
	}, [translations])

	useEffect(() => {
		fetchTrackNames().catch(console.error)
		fetchUser().catch(console.error)
	}, [fetchTrackNames, fetchUser])

	useEffect(() => {
		fetchTracks().catch(console.error)
	}, [fetchTracks])

	useEffect(() => {
		// Reset to page 1 when switching between views or changing sort/filter
		setPage(1)
	}, [showProblematic, sortField, sortDirection, selectedTrackName])

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
			setTotalCount(prev => prev - 1)
		} catch (error) {
			console.error('Failed to delete track:', error)
			alert('Failed to delete track. Please try again.')
		}
	}, [])

	const handleInlineRename = useCallback(async (oldName: string, newName: string): Promise<void> => {
		const trimmedOld = oldName.trim()
		const trimmedNew = newName.trim()

		if (!trimmedOld || !trimmedNew) {
			alert('Please fill in both fields.')
			return
		}

		if (trimmedOld === trimmedNew) {
			return // No change
		}

		// Check if new name already exists
		const existingNames = trackNames.filter(name => name !== 'All')
		if (existingNames.includes(trimmedNew) && trimmedOld !== trimmedNew) {
			const confirmed = confirm(
				`Warning: A track type named "${trimmedNew}" already exists. ` +
				`Renaming "${trimmedOld}" to "${trimmedNew}" will combine all tracks from both types. ` +
				'This action cannot be undone and there will be no way to separate them again.\n\n' +
				'Do you want to continue?'
			)
			if (!confirmed) {
				// Reset the editing state
				setEditingTrackName(prev => {
					const newState = { ...prev }
					delete newState[oldName]
					return newState
				})
				return
			}
		}

		setRenamingTrackName(true)
		try {
			const response = await axios.patch<{ modifiedCount: number }>(
				`${API_URL}/v1/tracks/bulk/rename`,
				{ oldName: trimmedOld, newName: trimmedNew },
				{ withCredentials: true }
			)

			alert(`Successfully renamed ${response.data.modifiedCount} track${response.data.modifiedCount !== 1 ? 's' : ''}`)

			// Update translations if the old name had a translation
			if (translations[trimmedOld]) {
				const newTranslations = { ...translations }
				newTranslations[trimmedNew] = newTranslations[trimmedOld]
				delete newTranslations[trimmedOld]
				await saveTranslations(newTranslations)
			}

			// Refresh track names and tracks
			await fetchTrackNames()
			await fetchTracks()

			// Clear the editing state for the old name
			setEditingTrackName(prev => {
				const newState = { ...prev }
				delete newState[oldName]
				return newState
			})
		} catch (error) {
			console.error('Failed to rename tracks:', error)
			alert('Failed to rename tracks. Please try again.')
			// Reset editing state on error
			setEditingTrackName(prev => {
				const newState = { ...prev }
				delete newState[oldName]
				return newState
			})
		} finally {
			setRenamingTrackName(false)
		}
	}, [trackNames, translations, saveTranslations, fetchTrackNames, fetchTracks])

	const problematicTracks = useMemo(() => tracks.filter(track => isNaN(new Date(track.date).getTime())), [tracks])
	const validTracks = useMemo(() => tracks.filter(track => !isNaN(new Date(track.date).getTime())), [tracks])

	const currentTracks = showProblematic ? problematicTracks : validTracks
	const totalPages = Math.ceil(totalCount / pageSize)
	const displayTracks = currentTracks

	const toggleSort = (field: 'date' | 'trackName'): void => {
		if (sortField === field) {
			setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
		} else {
			setSortField(field)
			setSortDirection('asc')
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4">
				<div className="flex items-center justify-between flex-wrap gap-4">
					<h2 className="text-2xl font-bold text-gray-200">
						{showProblematic ? 'Problematic Tracks' : 'Latest Tracks'}
					</h2>
					<div className="flex items-center gap-4 flex-wrap">
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
									? 'Show Valid Tracks'
									: `Show ${problematicTracks.length} Problematic Track${problematicTracks.length !== 1 ? 's' : ''}`}
							</button>
						)}
						<div className="flex items-center gap-2">
							<label htmlFor="pageSize" className="text-gray-400 text-sm whitespace-nowrap">{'Per page:'}</label>
							<select
								id="pageSize"
								value={pageSize}
								onChange={(e) => {
									setPageSize(Number(e.target.value))
									setPage(1)
								}}
								className="bg-gray-700 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
							>
								<option value={50}>{'50'}</option>
								<option value={100}>{'100'}</option>
								<option value={250}>{'250'}</option>
								<option value={500}>{'500'}</option>
							</select>
						</div>
						<div className="text-gray-400 text-sm whitespace-nowrap">
							{showProblematic
								? `${problematicTracks.length} problematic track${problematicTracks.length !== 1 ? 's' : ''}`
								: `${totalCount.toLocaleString()} total track${totalCount !== 1 ? 's' : ''}`}
						</div>
					</div>
				</div>

				{!showProblematic && trackNames.length > 1 && (
					<div className="bg-gray-800 rounded-lg border border-gray-700 mb-4">
						<button
							onClick={() => setTrackManagementExpanded(!trackManagementExpanded)}
							className="w-full flex items-center justify-between p-4 hover:bg-gray-700 transition-colors rounded-lg cursor-pointer"
						>
							<h3 className="text-lg font-semibold text-white">{'Track Name Management'}</h3>
							<span className="text-sm text-blue-400 font-medium">
								{trackManagementExpanded ? 'Collapse' : 'Expand'}
							</span>
						</button>
						{trackManagementExpanded && (
							<div className="px-4 pb-4">
								<p className="text-sm text-gray-400 mb-4">
									{'Manage your track names and display labels. Changes to internal names will affect all associated tracks.'}
								</p>
								<div className="grid grid-cols-2 gap-2 sm:gap-3 mb-2">
									<div className="min-w-0">
										<div className="flex items-center gap-1 sm:gap-2 mb-2 flex-wrap">
											<div className="text-xs font-semibold text-gray-400 uppercase whitespace-nowrap">
												{'Internal Name (Backend)'}
											</div>
											{editModeEnabled ? (
												<button
													onClick={disableEditMode}
													disabled={renamingTrackName}
													className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-500 disabled:opacity-50 flex items-center gap-1"
												>
													<span>{'🔒'}</span>
													<span>{'Lock'}</span>
												</button>
											) : (
												<button
													onClick={() => {
														const confirmed = confirm('Are you sure you want to unlock all internal names for editing? This will allow you to rename all tracks.')
														if (confirmed) {
															enableEditMode()
														}
													}}
													disabled={renamingTrackName}
													className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-500 disabled:opacity-50 flex items-center gap-1"
												>
													<span>{'🔓'}</span>
													<span>{'Unlock'}</span>
												</button>
											)}
										</div>
										<p className="text-xs font-normal text-gray-500 mt-1 normal-case">
											{'The actual name stored in the database and used for webhooks. This is the trackName you are using. Changing this will rename all matching tracks.'}
										</p>
									</div>
									<div className="text-xs font-semibold text-gray-400 uppercase min-w-0">
										<div className="whitespace-nowrap">{'Display Name (Frontend)'}</div>
										<p className="text-xs font-normal text-gray-500 mt-1 normal-case">
											{'Optional friendly name shown throughout the app. Leave empty to use the internal name.'}
										</p>
									</div>
								</div>
								<div className="space-y-2">
									{trackNames.filter(name => name !== 'All').map((trackName) => (
										<div key={trackName} className="grid grid-cols-2 gap-2 sm:gap-3">
											<div className="flex items-center gap-1 sm:gap-2 min-w-0">
												<input
													type="text"
													value={editingTrackName[trackName] ?? trackName}
													onChange={(e) => {
														setEditingTrackName(prev => ({
															...prev,
															[trackName]: e.target.value
														}))
													}}
													disabled={renamingTrackName || !editModeEnabled}
													readOnly={!editModeEnabled}
													className="flex-1 min-w-0 px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-gray-700 border border-gray-600 rounded text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 read-only:cursor-not-allowed"
												/>
												{editModeEnabled && hasUnsavedChanges(trackName) && (
													<>
														<button
															onClick={() => {
																setEditingTrackName(prev => {
																	const newState = { ...prev }
																	delete newState[trackName]
																	return newState
																})
															}}
															disabled={renamingTrackName}
															className="p-1 sm:p-1.5 text-gray-400 hover:text-gray-200 disabled:opacity-50 shrink-0"
															title="Undo changes"
														>
															{'\u21ba'}
														</button>
														<button
															onClick={() => {
																const newName = editingTrackName[trackName]
																if (newName && newName !== trackName) {
																	handleInlineRename(trackName, newName).catch(console.error)
																}
															}}
															disabled={renamingTrackName}
															className="p-1 sm:p-1.5 text-green-400 hover:text-green-300 disabled:opacity-50 shrink-0"
															title="Confirm rename"
														>
															{'\u2713'}
														</button>
													</>
												)}
											</div>
											<div className="flex items-center gap-1 sm:gap-2 min-w-0">
												<input
													type="text"
													value={translations[trackName] ?? ''}
													onChange={(e) => {
														const newTranslations = { ...translations, [trackName]: e.target.value }
														setTranslations(newTranslations)
														setEditingTranslation(trackName)
													}}
													onBlur={() => {
														if (editingTranslation === trackName) {
															saveTranslations(translations).catch(console.error)
															setEditingTranslation(null)
														}
													}}
													placeholder={trackName}
													disabled={savingTranslations}
													className="flex-1 min-w-0 px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
												/>
												{translations[trackName] && (
													<button
														onClick={() => {
															const newTranslations = { ...translations }
															delete newTranslations[trackName]
															setTranslations(newTranslations)
															saveTranslations(newTranslations).catch(console.error)
														}}
														disabled={savingTranslations}
														className="px-2 sm:px-3 py-1.5 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded disabled:opacity-50 transition-colors shrink-0 whitespace-nowrap"
													>
														{'Clear'}
													</button>
												)}
											</div>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				)}

				{!showProblematic && trackNames.length > 1 && (
					<div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
						<div className="mb-3">
							<span className="text-sm font-medium text-gray-300">{'Filter by Track Type:'}</span>
						</div>
						<div className="flex flex-wrap gap-2">
							{trackNames.map((name) => (
								<button
									key={name}
									onClick={() => setSelectedTrackName(name)}
									className={`px-3 py-2 sm:px-4 sm:py-2 rounded-lg font-medium text-xs sm:text-sm transition-colors whitespace-nowrap ${
										selectedTrackName === name
											? 'bg-blue-600 text-white'
											: 'bg-gray-700 text-gray-300 hover:bg-gray-600'
									}`}
								>
									{name === 'All' ? name : getTranslatedName(name)}
								</button>
							))}
						</div>
					</div>
				)}
			</div>

			{showProblematic && problematicTracks.length > 0 && (
				<div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
					<p className="text-red-300 text-sm">
						<span className="font-bold">{'Warning: '}</span>
						{'These tracks have invalid dates and will not appear in visualizations. You can delete them to clean up your data.'}
					</p>
				</div>
			)}

			{/* Pagination Controls */}
			{!showProblematic && totalPages > 1 && (
				<div className="flex items-center justify-between flex-wrap gap-4 px-4">
					<div className="text-gray-400 text-sm">
						{`Showing ${((page - 1) * pageSize) + 1}-${Math.min(page * pageSize, totalCount)} of ${totalCount.toLocaleString()}`}
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={() => setPage(1)}
							disabled={page === 1}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'First'}
						</button>
						<button
							onClick={() => setPage(p => Math.max(1, p - 1))}
							disabled={page === 1}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'Previous'}
						</button>
						<span className="text-gray-300 text-sm px-3">
							{`Page ${page} of ${totalPages}`}
						</span>
						<button
							onClick={() => setPage(p => Math.min(totalPages, p + 1))}
							disabled={page === totalPages}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'Next'}
						</button>
						<button
							onClick={() => setPage(totalPages)}
							disabled={page === totalPages}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'Last'}
						</button>
					</div>
				</div>
			)}

			<div className="bg-gray-800 rounded-lg overflow-hidden">
				<table className="w-full">
					<thead className="bg-gray-700">
						<tr>
							<th
								onClick={() => toggleSort('trackName')}
								className="px-2 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
							>
								<div className="flex items-center gap-1">
									<span className="hidden sm:inline">{'Track Name'}</span>
									<span className="sm:hidden">{'Track'}</span>
									{sortField === 'trackName' && (
										<span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
									)}
								</div>
							</th>
							<th
								onClick={() => toggleSort('date')}
								className="px-2 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
							>
								<div className="flex items-center gap-1">
									{'Date'}
									{sortField === 'date' && (
										<span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
									)}
								</div>
							</th>
							<th className="hidden md:table-cell px-2 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
								{'Time'}
							</th>
							<th className="px-2 sm:px-4 md:px-6 py-2 sm:py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
								<span className="hidden sm:inline">{'Actions'}</span>
								<span className="sm:hidden">{'Del'}</span>
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-700">
						{loading ? (
							<tr>
								<td colSpan={4} className="px-6 py-12 text-center">
									<div className="flex items-center justify-center gap-2">
										<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
										<span className="text-gray-400">{'Loading...'}</span>
									</div>
								</td>
							</tr>
						) : displayTracks.length === 0 ? (
							<tr>
								<td colSpan={4} className="px-6 py-12 text-center text-gray-400">
									{showProblematic ? 'No problematic tracks found' : 'No tracks found'}
								</td>
							</tr>
						) : (
							displayTracks.map((track, index) => {
								const date = new Date(track.date)
								const isInvalid = isNaN(date.getTime())
								return (
									<tr key={track._id ?? index} className={`hover:bg-gray-750 ${isInvalid ? 'bg-red-900/10' : ''}`}>
										<td className="px-2 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 text-xs sm:text-sm font-medium text-gray-200">
											<div className="truncate max-w-[100px] sm:max-w-none">
												{getTranslatedName(track.trackName)}
											</div>
										</td>
										<td className="px-2 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 text-xs sm:text-sm text-gray-300">
											{isInvalid ? (
												<span className="text-red-400 font-mono text-xs">{String(track.date)}</span>
											) : (
												<>
													<div className="md:hidden">
														<div>{date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</div>
														<div className="text-[10px] text-gray-400">{date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
													</div>
													<div className="hidden md:block whitespace-nowrap">
														{date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
													</div>
												</>
											)}
										</td>
										<td className="hidden md:table-cell px-2 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-400">
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
										<td className="px-2 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm">
											<button
												onClick={() => handleDelete(track._id!)}
												className="text-red-400 hover:text-red-300 font-medium transition-colors"
											>
												<span className="hidden sm:inline">{'Delete'}</span>
												<span className="sm:hidden">{'Del'}</span>
											</button>
										</td>
									</tr>
								)
							}))
						}
					</tbody>
				</table>
			</div>

			{/* Bottom Pagination Controls */}
			{!showProblematic && totalPages > 1 && (
				<div className="flex items-center justify-between flex-wrap gap-4 px-4">
					<div className="text-gray-400 text-sm">
						{`Showing ${((page - 1) * pageSize) + 1}-${Math.min(page * pageSize, totalCount)} of ${totalCount.toLocaleString()}`}
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={() => setPage(1)}
							disabled={page === 1}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'First'}
						</button>
						<button
							onClick={() => setPage(p => Math.max(1, p - 1))}
							disabled={page === 1}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'Previous'}
						</button>
						<span className="text-gray-300 text-sm px-3">
							{`Page ${page} of ${totalPages}`}
						</span>
						<button
							onClick={() => setPage(p => Math.min(totalPages, p + 1))}
							disabled={page === totalPages}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'Next'}
						</button>
						<button
							onClick={() => setPage(totalPages)}
							disabled={page === totalPages}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'Last'}
						</button>
					</div>
				</div>
			)}
		</div>
	)
}
