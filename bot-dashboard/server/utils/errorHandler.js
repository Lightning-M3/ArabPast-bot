const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  // تصنيف الأخطاء
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'خطأ في البيانات المدخلة',
      details: err.message
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'غير مصرح لك بالوصول'
    });
  }

  // الأخطاء العامة
  res.status(500).json({
    error: 'حدث خطأ في السيرفر',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
}; 