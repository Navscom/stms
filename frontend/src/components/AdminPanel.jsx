import { useEffect, useState } from 'react';
import { validateDestinationForm } from '../utils/validation';
import { loadDestinations, loadDangerPins, loadReport } from '../utils/LoadData';
import { deleteDestination } from '../utils';
import '../css/AdminPanel.css';

function AdminPanel({ api, user, destinations, setAppDestinations, setAppDangerPins, setAppReport }) {
  const [form, setForm] = useState({
    name: '', category: '', city: '', province: '', lat: '', lng: '', description: '', opening_hours: '', crowd_level: 'Low'
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 5;

  // Filter and sort destinations alphabetically by name
  const filteredDestinations = destinations
    .filter((d) => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  
  const totalPages = Math.max(1, Math.ceil(filteredDestinations.length / perPage));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const updateForm = (key, value) => setForm({ ...form, [key]: value });

  const addDestination = async (e) => {
    e.preventDefault();
    const validation = validateDestinationForm(form, destinations);
    if (!validation.valid) {
      alert(validation.message);
      return;
    }
    const payload = validation.payload;
    const res = await fetch(`${api}/destinations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (res.ok) {
      alert('Destination added successfully.');
      setForm({ name: '', category: '', city: '', province: '', lat: '', lng: '', description: '', opening_hours: '', crowd_level: 'Low' });
      await refreshAll();
    } else {
      const data = await res.json();
      alert(data.detail || 'Failed to add destination.');
    }
  };

  const updateCrowd = async (id, crowd_level) => {
    const res = await fetch(`${api}/destinations/${id}/crowd`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crowd_level, user_id: user?.id ?? null })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.detail || 'Failed to update crowd status.');
      return;
    }
    await refreshAll();
  };

  const paginatedDestinations = filteredDestinations.slice((page - 1) * perPage, page * perPage);

  const refreshAll = async () => {
    if (typeof setAppDestinations === 'function') {
      await loadDestinations(setAppDestinations, { fallbackDestinations: [] });
    }
    if (typeof setAppDangerPins === 'function') {
      await loadDangerPins(setAppDangerPins);
    }
    if (typeof setAppReport === 'function') {
      await loadReport(setAppReport);
    }
  };

  const removeDestination = async (id) => {
    if (user?.role !== 'administrator') {
      alert('Only an Administrator can delete a destination.');
      return;
    }
    if (!window.confirm('Delete this destination permanently?')) {
      return;
    }
    const res = await deleteDestination(id);
    if (res?.message) {
      alert('Destination deleted successfully.');
      await refreshAll();
    }
  };

  return (
    <section className="admin-panel">
      <h2>Admin Dashboard</h2>
      <p>Manage tourist attractions and update crowd monitoring status.</p>
      <form className="admin-form" onSubmit={addDestination}>
        {['name', 'category', 'city', 'province', 'lat', 'lng'].map((field) => (
          <input key={field} placeholder={field.toUpperCase()} value={form[field]} onChange={(e) => updateForm(field, e.target.value)} required />
        ))}
        <input placeholder="Opening Hours (e.g., 8:00 AM - 5:00 PM)" value={form.opening_hours} onChange={(e) => updateForm('opening_hours', e.target.value)} />
        <select value={form.crowd_level} onChange={(e) => updateForm('crowd_level', e.target.value)}>
          <option>Low</option><option>Moderate</option><option>High</option>
        </select>
        <textarea placeholder="Description" value={form.description} onChange={(e) => updateForm('description', e.target.value)} required />
        <button className="primary-btn">Add Destination</button>
      </form>

      <hr className="admin-separator" />

      <div className="search-header">
        <h3>Update Crowd Status</h3>
        <input
          type="text"
          className="search-input"
          placeholder="Search destinations by name..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="admin-list">
        {paginatedDestinations.map((d) => (
          <div className="admin-row" key={d.id}>
            <span>{d.name}</span>
            <select value={d.crowd_level} onChange={(e) => updateCrowd(d.id, e.target.value)}>
              <option>Low</option><option>Moderate</option><option>High</option>
            </select>
            {user?.role === 'administrator' && (
              <button type="button" className="secondary-btn" onClick={() => removeDestination(d.id)}>
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="pagination-controls">
          <button type="button" disabled={page === 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button type="button" disabled={page === totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
            Next
          </button>
        </div>
      )}
    </section>
  );
}

export default AdminPanel;
