import { type Metadata } from 'next'

export const metadata: Metadata = {
	title: {
		template: '%s | Life Stats',
		default: ' Request Password Reset'
	},
	alternates: {
		canonical: 'https://life-stats.net/request-password-reset'
	}
}

export default function RequestPasswordResetLayout ({
	children
}: Readonly<{
	children: React.ReactNode
}>): React.JSX.Element {
	return <section>
		{children}
	</section>
}
