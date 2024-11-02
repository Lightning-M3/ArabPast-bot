import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Breadcrumbs, Typography } from '@mui/material';

function Navigation() {
  const location = useLocation();
  const pathSegments = location.pathname.split('/').filter(Boolean);
  
  return (
    <Breadcrumbs sx={{ mb: 2 }}>
      <Link to="/servers" style={{ textDecoration: 'none', color: 'inherit' }}>
        السيرفرات
      </Link>
      {pathSegments.includes('settings') && <Typography>الإعدادات</Typography>}
      {pathSegments.includes('attendance') && <Typography>سجل الحضور</Typography>}
      {pathSegments.includes('tickets') && <Typography>التذاكر</Typography>}
    </Breadcrumbs>
  );
}

export default Navigation; 