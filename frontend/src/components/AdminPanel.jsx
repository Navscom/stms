import { useState } from 'react';

export default function AdminPanel({ api, destinations, onRefresh }) {
  const [form, setForm] = useState({
    name: '', category: '', city: '', province: '', lat: '', lng: '', description: '', opening_hours: '8:00 AM - 5:00 PM', crowd_level: 'Low'
  });

  const updateForm = (key, value) => setForm({ ...form, [key]: value });

  const addDestination = async (e) => {
    e.preventDefault();
    const payload = { ...form, lat: Number(form.lat), lng: Number(form.lng) };
    const res = await fetch(`${api}/destinations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (res.ok) {
      alert('Destination added successfully.');
      setForm({ name: '', category: '', city: '', province: '', lat: '', lng: '', description: '', opening_hours: '8:00 AM - 5:00 PM', crowd_level: 'Low' });
      onRefresh();
    } else {
      const data = await res.json();
      alert(data.detail || 'Failed to add destination.');
    }
  };

  const updateCrowd = async (id, crowd_level) => {
    await fetch(`${api}/destinations/${id}/crowd`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ crowd_level })
    });
    onRefresh();
  };

  return (
    <section className="admin-panel">
      <h2>Admin Dashboard</h2>
      <p>Manage destinations and update crowd monitoring status.</p>
      <form className="admin-form" onSubmit={addDestination}>
        {['name', 'category', 'city', 'province', 'lat', 'lng'].map((field) => (
          <input key={field} placeholder={field.toUpperCase()} value={form[field]} onChange={(e) => updateForm(field, e.target.value)} required />
        ))}
        <input placeholder="Opening Hours" value={form.opening_hours} onChange={(e) => updateForm('opening_hours', e.target.value)} />
        <select value={form.crowd_level} onChange={(e) => updateForm('crowd_level', e.target.value)}>
          <option>Low</option><option>Moderate</option><option>High</option>
        </select>
        <textarea placeholder="Description" value={form.description} onChange={(e) => updateForm('description', e.target.value)} required />
        <button className="primary-btn">Add Destination</button>
      </form>

      <h3>Update Crowd Status</h3>
      <div className="admin-list">
        {destinations.map((d) => (
          <div className="admin-row" key={d.id}>
            <span>{d.name}</span>
            <select value={d.crowd_level} onChange={(e) => updateCrowd(d.id, e.target.value)}>
              <option>Low</option><option>Moderate</option><option>High</option>
            </select>
          </div>
        ))}
      </div>
    </section>
  );
}
