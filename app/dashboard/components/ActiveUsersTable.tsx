'use client';

import { useState } from 'react';
import { ActiveUserData } from '@/lib/types';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { format } from 'date-fns';

interface ActiveUsersTableProps {
    data: ActiveUserData[];
    loading?: boolean;
}

type SortField = 'user' | 'uploads' | 'lastActive' | 'totalViews';
type SortDirection = 'asc' | 'desc';

export default function ActiveUsersTable({ data, loading }: ActiveUsersTableProps) {
    const [sortField, setSortField] = useState<SortField>('lastActive');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [displayCount, setDisplayCount] = useState(10);

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

    const sortedData = [...data].sort((a, b) => {
        let aValue: any = a[sortField];
        let bValue: any = b[sortField];

        if (sortField === 'lastActive') {
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
            <h3 className="font-semibold text-lg text-gray-700 mb-4">Active Users</h3>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-4 py-3 text-left">
                                <button
                                    onClick={() => handleSort('user')}
                                    className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-blue-600"
                                >
                                    User
                                    <SortIcon field="user" />
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                                Role
                            </th>
                            <th className="px-4 py-3 text-left">
                                <button
                                    onClick={() => handleSort('uploads')}
                                    className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-blue-600"
                                >
                                    Uploads
                                    <SortIcon field="uploads" />
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left">
                                <button
                                    onClick={() => handleSort('lastActive')}
                                    className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-blue-600"
                                >
                                    Last Active
                                    <SortIcon field="lastActive" />
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left">
                                <button
                                    onClick={() => handleSort('totalViews')}
                                    className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-blue-600"
                                >
                                    Total Views
                                    <SortIcon field="totalViews" />
                                </button>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayedData.map((user) => (
                            <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-900">{user.user}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{user.role}</td>
                                <td className="px-4 py-3 text-sm text-gray-900">{user.uploads}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                    {format(new Date(user.lastActive), 'dd-MM-yyyy')}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900">{user.totalViews}</td>
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

            {!hasMore && data.length > 10 && (
                <div className="mt-4 text-center text-sm text-gray-500">
                    Showing all {data.length} users
                </div>
            )}
        </div>
    );
}
