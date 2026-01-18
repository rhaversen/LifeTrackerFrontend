'use client'

import axios from 'axios'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, type ReactElement } from 'react'

import IngressTab from '@/components/IngressTab'
import VisualizeTab from '@/components/VisualizeTab'

const API_URL = process.env.NEXT_PUBLIC_API_URL

type Tab = 'visualize' | 'ingress'

export default function Page (): ReactElement {
	const router = useRouter()
	const [activeTab, setActiveTab] = useState<Tab>('visualize')
	const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

	useEffect(() => {
		const checkAuth = async (): Promise<void> => {
			try {
				await axios.get(`${API_URL}/v1/auth/is-authenticated`, { withCredentials: true })
				setIsAuthenticated(true)
			} catch {
				setIsAuthenticated(false)
			}
		}
		checkAuth().catch(console.error)
	}, [])

	const handleLogout = useCallback(async () => {
		try {
			await axios.post(`${API_URL}/v1/auth/logout`, {}, { withCredentials: true })
			setIsAuthenticated(false)
		} catch (error) {
			console.error('Logout failed:', error)
		}
	}, [])

	if (isAuthenticated === null) {
		return (
			<div className="min-h-screen bg-gray-900 flex items-center justify-center">
				<div className="text-gray-300 text-xl">{'Loading...'}</div>
			</div>
		)
	}

	return (
		<div className="min-h-screen bg-gray-900">
			<header className="sticky top-0 z-10 bg-gray-800 border-b border-gray-700 px-6 py-4">
				<div className="max-w-7xl mx-auto flex items-center">
					<h1 className="text-2xl font-bold text-white">{'Life Tracker'}</h1>
					{isAuthenticated && (
						<nav className="flex-1 flex justify-center gap-8">
							<button
								onClick={() => setActiveTab('visualize')}
								className={`px-2 py-2 font-medium transition-colors border-b-2 ${
									activeTab === 'visualize'
										? 'text-blue-400 border-blue-400'
										: 'text-gray-400 border-transparent hover:text-gray-200'
								}`}
							>
								{'Visualize'}
							</button>
							<button
								onClick={() => setActiveTab('ingress')}
								className={`px-2 py-2 font-medium transition-colors border-b-2 ${
									activeTab === 'ingress'
										? 'text-blue-400 border-blue-400'
										: 'text-gray-400 border-transparent hover:text-gray-200'
								}`}
							>
								{'Import'}
							</button>
						</nav>
					)}
					<div className="flex items-center gap-4">
						{isAuthenticated ? (
							<button
								onClick={handleLogout}
								className="px-4 py-2 rounded-lg font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
							>
								{'Logout'}
							</button>
						) : (
							<div className="flex gap-2">
								<button
									onClick={() => router.push('/signin')}
									className="px-4 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
								>
									{'Sign In'}
								</button>
								<button
									onClick={() => router.push('/signup')}
									className="px-4 py-2 rounded-lg font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
								>
									{'Sign Up'}
								</button>
							</div>
						)}
					</div>
				</div>
			</header>

			<main className="max-w-7xl mx-auto px-6 py-8">
				{isAuthenticated ? (
					<>
						{activeTab === 'visualize' && <VisualizeTab />}
						{activeTab === 'ingress' && <IngressTab />}
					</>
				) : (
					<div className="flex flex-col items-center justify-center py-20">
						<h2 className="text-2xl font-semibold text-gray-200 mb-4">{'Welcome to Life Tracker'}</h2>
						<p className="text-gray-400 text-center max-w-md">
							{'Sign in to track and visualize your life events. Create custom trackers, import historical data, and gain insights through beautiful visualizations.'}
						</p>
					</div>
				)}
			</main>
		</div>
	)
}
