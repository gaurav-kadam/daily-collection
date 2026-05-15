import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useNavigate } from 'react-router-dom'
import { FiEye, FiPlus, FiSearch } from 'react-icons/fi'
import Loader from '../components/Loader'
import Pagination from '../components/customers/Pagination'
import StatusBadge from '../components/customers/StatusBadge'
import useAuth from '../hooks/useAuth'
import useDebouncedValue from '../hooks/useDebouncedValue'
import {
  getAll,
  searchCustomers,
} from '../services/customerService'
import { USER_ROLES } from '../services/firestoreService'
import { formatCurrency, formatPhone } from '../utils/format'

const customerRouteId = (customer) => customer.id || customer.customerId

function CustomersPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [customers, setCustomers] = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const isAdmin = user?.role === USER_ROLES.admin
  const debouncedSearch = useDebouncedValue(search, 250)

  useEffect(() => {
    if (!user) return
    let isMounted = true
    setLoading(true)

    getAll({ currentUser: user, pageSize: 200 })
      .then((customerData) => {
        if (!isMounted) return
        setCustomers(customerData.results || [])
      })
      .catch((error) => toast.error(error.message))
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [user])

  useEffect(() => {
    if (!user) return undefined
    const query = debouncedSearch.trim()
    setPage(1)

    if (!query) {
      setSearchResults([])
      setSearchLoading(false)
      setSearchError('')
      return undefined
    }

    let isMounted = true
    setSearchLoading(true)
    setSearchError('')

    searchCustomers({ term: query, currentUser: user, pageSize: 50 })
      .then((customerData) => {
        if (!isMounted) return
        setSearchResults(customerData.results || [])
      })
      .catch(() => {
        if (!isMounted) return
        setSearchResults([])
        setSearchError('Showing loaded customer matches while search indexing catches up.')
      })
      .finally(() => {
        if (isMounted) setSearchLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [debouncedSearch, user])

  const filteredCustomers = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase()
    if (!query) return customers
    const localMatches = customers.filter((customer) =>
      [customer.shopName, customer.ownerName, customer.mobile, customer.area]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
    const merged = new Map()
    const matches = [...searchResults, ...localMatches]
    matches.forEach((customer) => {
      merged.set(customerRouteId(customer), customer)
    })
    return [...merged.values()].sort((first, second) =>
      String(first.shopName || '').localeCompare(String(second.shopName || '')),
    )
  }, [customers, debouncedSearch, searchResults])

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  )

  const openCustomer = (customer) => {
    navigate(`/customers/${customerRouteId(customer)}`)
  }

  if (loading) {
    return <Loader text="Loading customers..." />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h2 className="page-title">{isAdmin ? 'Customers' : 'My Customers'}</h2>
          <p className="mt-1 text-sm text-slate-500">{filteredCustomers.length} records</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">
          <label className="relative block w-full md:w-80">
            <FiSearch className="pointer-events-none absolute left-3 top-3 text-slate-400" />
            <input
              className="input-field pl-10"
              placeholder="Search shop, owner, or mobile"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {isAdmin && (
            <Link to="/customers/add" className="btn-primary gap-2">
              <FiPlus />
              Add Customer
            </Link>
          )}
        </div>
      </div>

      {(searchLoading || searchError) && (
        <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          {searchLoading ? 'Searching indexed customer records...' : searchError}
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Shop</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">Daily</th>
                <th className="px-4 py-3">Savings</th>
                <th className="px-4 py-3">Pending</th>
                <th className="px-4 py-3">Collector</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Profile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {paginatedCustomers.map((customer) => (
                <tr
                  key={customerRouteId(customer)}
                  className="cursor-pointer transition hover:bg-slate-50"
                  onClick={() => openCustomer(customer)}
                >
                  <td className="px-4 py-3 font-semibold text-slate-950">{customer.shopName}</td>
                  <td className="px-4 py-3 text-slate-600">{customer.ownerName}</td>
                  <td className="px-4 py-3 text-slate-600">{formatPhone(customer.mobile)}</td>
                  <td className="px-4 py-3 text-slate-900">{formatCurrency(customer.dailyAmount)}</td>
                  <td className="px-4 py-3 text-emerald-700">
                    {formatCurrency(customer.totalSavings)}
                  </td>
                  <td className="px-4 py-3 text-rose-700">
                    {formatCurrency(customer.pendingAmount)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {customer.assignedCollectorName || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={customer.status} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                      onClick={(event) => {
                        event.stopPropagation()
                        openCustomer(customer)
                      }}
                    >
                      <FiEye />
                      View Profile
                    </button>
                  </td>
                </tr>
              ))}
              {paginatedCustomers.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan="9">
                    No customers found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          total={filteredCustomers.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
      </section>
    </div>
  )
}

export default CustomersPage
