import { type Metadata } from 'next'

export const metadata: Metadata = {
	title: {
		template: '%s | Life Stats',
		default: 'Sign Up'
	},
	alternates: {
		canonical: 'https://life-stats.net/signup'
	}
}

export default function SignupLayout ({
	children
}: Readonly<{
	children: React.ReactNode
}>): React.JSX.Element {
	return <section>
		{children}
	</section>
}
