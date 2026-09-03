'use client'

import type {ChangeEventHandler} from 'react'
import styles from './SectionSearchField.module.css'

export function SectionSearchField({label, onChange, placeholder, value}: {label: string; onChange: ChangeEventHandler<HTMLInputElement>; placeholder: string; value: string}) {
  return <label className={styles.field}>
    <span className="sr-only">{label}</span>
    <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
    <input aria-label={label} onChange={onChange} placeholder={placeholder} type="search" value={value}/>
  </label>
}
