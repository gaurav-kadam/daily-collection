import { FiSearch } from 'react-icons/fi'

function SearchBar({ value, onChange, placeholder = 'Search customers...' }) {
  return (
    <label className="relative block w-full">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
        <FiSearch />
      </span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="input-field pl-10"
      />
    </label>
  )
}

export default SearchBar
