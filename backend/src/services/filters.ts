import type { LocationRecord } from '../types.js'

export interface FilterDef { id: string; label: string; test: (l: LocationRecord) => boolean }
const cat = (...c: string[]) => (l: LocationRecord) => c.includes(l.category)

export const FILTERS: FilterDef[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'academics', label: 'Academics', test: cat('academics', 'buildings') },
  { id: 'departments', label: 'Departments', test: cat('departments') },
  { id: 'labs', label: 'Labs', test: cat('labs') },
  { id: 'library', label: 'Library', test: cat('library') },
  { id: 'food', label: 'Food', test: cat('food') },
  { id: 'sports', label: 'Sports', test: cat('sports') },
  { id: 'student-life', label: 'Student Life', test: cat('student-life') },
  { id: 'administration', label: 'Administration', test: cat('administration', 'services', 'student-services') },
  { id: 'health', label: 'Health', test: cat('health') },
  { id: 'emergency', label: 'Emergency', test: (l) => l.isEmergency || l.category === 'emergency' },
  { id: 'accessibility', label: 'Accessibility', test: (l) => l.category === 'accessibility' || l.accessibility.lift || l.accessibility.ramp || l.accessibility.accessibleRestroom },
  { id: 'digital-services', label: 'Digital Services', test: (l) => l.id === 'v-print' },
]

/** Search-box categories from the spec, mapped onto filters / predicates. */
export const SEARCH_CATEGORIES: FilterDef[] = [
  { id: 'buildings', label: 'Buildings', test: cat('buildings') },
  { id: 'departments', label: 'Departments', test: cat('departments') },
  { id: 'labs', label: 'Labs', test: cat('labs') },
  { id: 'facilities', label: 'Facilities', test: cat('academics', 'library', 'utilities', 'accessibility', 'student-life') },
  { id: 'food', label: 'Food', test: cat('food') },
  { id: 'sports', label: 'Sports', test: cat('sports') },
  { id: 'student-services', label: 'Student Services', test: cat('student-services', 'services') },
  { id: 'administration', label: 'Administration', test: cat('administration') },
  { id: 'emergency', label: 'Emergency', test: (l) => l.isEmergency || l.category === 'emergency' },
]

export const findFilter = (id: string) => FILTERS.find((f) => f.id === id) ?? SEARCH_CATEGORIES.find((f) => f.id === id)
