export interface Track {
	_id: string
	trackName: string
	date: string
	userId: string
	createdAt: string
	updatedAt: string
}

export interface ProcessedTrack extends Track {
	dateObj: Date
	dayOfWeek: number
	hourOfDay: number
	deltaDays: number | null
}
