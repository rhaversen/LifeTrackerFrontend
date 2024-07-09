import ErrorProvider from '@/contexts/ErrorContext/ErrorProvider'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { type ReactElement } from 'react'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
	title: {
		template: '%s | Life Stats',
		default: 'Home'
	},
	description: 'Check your life stats',
	alternates: {
		canonical: 'https://life-stats.net'
	},
	icons: {
		icon: '/favicon.ico'
	}
}

export default function RootLayout ({
	children
}: Readonly<{
	children: React.ReactNode
}>): ReactElement {
	return (
		<html lang="en">
			<body className={inter.className}>
				<ErrorProvider>
					{children}
				</ErrorProvider>
			</body>
		</html>
	)
}
