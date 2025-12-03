'use client';

import { useState } from 'react';
import { ActiveUserData } from '@/lib/types';
import { ArrowUp, ArrowDown, Search } from 'lucide-react';
import { format } from 'date-fns';

interface ActiveUsersTableProps {
    data: ActiveUserData[];
    loading?: boolean;
}

type SortField = 'email' | 'customerName' | 'clientName' | 'lastLogin' | 'isActive';
type SortDirection = 'asc' | 'desc';

export default function ActiveUsersTable({ data, loading }: ActiveUsersTableProps) {
    const [sortField, setSortField] = useState<SortField>('lastLogin');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [displayCount, setDisplayCount] = useState(10);
    const [searchTerm, setSearchTerm] = useState('');

    if (loading) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="font-semibold text-lg text-gray-700 mb-4">Active Users</h3>
                <div className="h-80 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
                </div>
            </div>
        );
    }

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    // Filter data by search term
    const filteredData = data.filter(user => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        return (
            user.email.toLowerCase().includes(search) ||
            user.clientName.toLowerCase().includes(search) ||
            user.customerName.toLowerCase().includes(search)
        );
    });

    const sortedData = [...filteredData].sort((a, b) => {
        let aValue: any = a[sortField];
        let bValue: any = b[sortField];

        if (sortField === 'lastLogin') {
            aValue = new Date(aValue).getTime();
            bValue = new Date(bValue).getTime();
        }

        if (sortDirection === 'asc') {
            return aValue > bValue ? 1 : -1;
        } else {
            return aValue < bValue ? 1 : -1;
        }
    });

    const displayedData = sortedData.slice(0, displayCount);
    const hasMore = displayCount < sortedData.length;

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) {
            return <ArrowUp className="h-4 w-4 text-gray-300" />;
        }
        return sortDirection === 'asc' ? (
            <ArrowUp className="h-4 w-4 text-blue-600" />
        ) : (
            <ArrowDown className="h-4 w-4 text-blue-600" />
        );
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg text-gray-700">Active Users</h3>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by email or client..."
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setDisplayCount(10); // Reset pagination on search
                        }}
                        className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-4 py-3 text-left">
                                <button
                                    onClick={() => handleSort('email')}
                                    className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-blue-600"
                                >
                                    Email
                                    <SortIcon field="email" />
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left">
                                <button
                                    onClick={() => handleSort('customerName')}
                                    className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-blue-600"
                                >
                                    Customer Name
                                    <SortIcon field="customerName" />
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left">
                                <button
                                    onClick={() => handleSort('clientName')}
                                    className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-blue-600"
                                >
                                    Client Name
                                    <SortIcon field="clientName" />
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left">
                                <button
                                    onClick={() => handleSort('lastLogin')}
                                    className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-blue-600"
                                >
                                    Last Login
                                    <SortIcon field="lastLogin" />
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left">
                                <button
                                    onClick={() => handleSort('isActive')}
                                    className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-blue-600"
                                >
                                    Status
                                    <SortIcon field="isActive" />
                                </button>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayedData.map((user) => (
                            <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-900">{user.email}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{user.customerName}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{user.clientName}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                    {format(new Date(user.lastLogin), 'dd-MM-yyyy')}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        user.isActive === 'Enabled' 
                                            ? 'bg-green-100 text-green-800' 
                                            : 'bg-red-100 text-red-800'
                                    }`}>
                                        {user.isActive}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {hasMore && (
                <div className="mt-4 text-center">
                    <button
                        onClick={() => setDisplayCount(displayCount + 10)}
                        className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                        Load More
                    </button>
                </div>
            )}

            {!hasMore && sortedData.length > 10 && (
                <div className="mt-4 text-center text-sm text-gray-500">
                    Showing all {sortedData.length} {searchTerm ? 'matching ' : ''}users
                </div>
            )}

            {searchTerm && sortedData.length === 0 && (
                <div className="mt-4 text-center text-sm text-gray-500">
                    No users found matching &quot;{searchTerm}&quot;
                </div>
            )}
        </div>
    );
}
