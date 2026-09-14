const ROLE_ROUTES = {
  USER: '/citizen',
  DRIVER: '/dispatch',
  MUNICIPAL_ADMIN: '/admin',
  SOFTWARE_ADMIN: '/workers',
  ADMIN: '/admin',
  OPERATOR: '/admin',
};

export function getDefaultRoute(role) {
  return ROLE_ROUTES[role] || '/citizen';
}

export function getRoleLabel(role) {
  const labels = {
    USER: 'Citizen User',
    DRIVER: 'Driver & Collector',
    MUNICIPAL_ADMIN: 'Municipal Admin',
    SOFTWARE_ADMIN: 'Software Administrator',
    ADMIN: 'Admin',
    OPERATOR: 'Operator',
  };
  return labels[role] || role;
}
