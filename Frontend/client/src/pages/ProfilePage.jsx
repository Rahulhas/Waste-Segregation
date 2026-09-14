import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Input } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getDefaultRoute } from '../lib/roles';

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [alternatePhone, setAlternatePhone] = useState(user?.alternatePhone || '');
  const [image, setImage] = useState(user?.image || '');
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setName(user?.name || '');
    setPhone(user?.phone || '');
    setAlternatePhone(user?.alternatePhone || '');
    setImage(user?.image || '');
  }, [user]);

  function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(file);
  }

  function handleSubmit(event) {
    event.preventDefault();
    updateProfile({ name: name.trim(), phone: phone.trim(), alternatePhone: alternatePhone.trim(), image });
    setSaved(true);
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-sage-700">Account</p>
          <h1 className="mt-1 text-3xl font-bold text-sage-900">Your profile</h1>
        </div>
        <Link to="/citizen" className="text-sm font-bold text-sage-700 hover:text-sage-900">Back to services</Link>
      </div>
      <Card>
        {saved && <div className="mb-5"><Alert variant="success">Your profile was saved on this device.</Alert></div>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            {image ? <img src={image} alt="Profile" className="h-20 w-20 rounded-full object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-full bg-mint text-2xl font-bold text-forest">{name.charAt(0).toUpperCase() || '?'}</div>}
            <div className="flex flex-col items-start gap-2 text-sm font-medium text-text-secondary">
              <span>Profile photo</span>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                {image ? 'Change photo' : 'Choose photo'}
              </Button>
            </div>
          </div>
          <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
          <Input label="Phone number" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required />
          <Input label="Alternative phone number (optional)" type="tel" value={alternatePhone} onChange={(event) => setAlternatePhone(event.target.value)} />
          <Input label="Email" value={user?.email || ''} disabled />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => navigate(getDefaultRoute(user?.role))}>Cancel</Button>
            <Button type="submit">Save profile</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}