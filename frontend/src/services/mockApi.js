import seedData from '../../fake.json';

const STORAGE_KEY = 'krishokmart-demo-database';
let memoryDatabase;

const clone = (value) => JSON.parse(JSON.stringify(value));

const readDatabase = () => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
    } catch (error) {
        console.warn('Could not read demo data from local storage.', error);
    }

    if (!memoryDatabase) memoryDatabase = clone(seedData.database);
    return memoryDatabase;
};

const saveDatabase = (database) => {
    memoryDatabase = database;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
    } catch (error) {
        console.warn('Could not persist demo data to local storage.', error);
    }
};

const respond = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => clone(body),
});

const getUserId = (options) => {
    const headers = options.headers || {};
    const token = headers.authorization || headers.Authorization || '';
    const match = String(token).match(/mock-jwt-token-user-(\d+)/);
    return match ? Number(match[1]) : null;
};

const getBody = (options) => {
    if (!options.body) return {};
    if (typeof options.body === 'string') {
        try {
            return JSON.parse(options.body);
        } catch {
            return {};
        }
    }
    return options.body;
};

const getCategoryName = (categoryId) =>
    seedData.categories.find((category) => category.category_id === Number(categoryId))?.category_name || '';

const presentProduct = (database, product) => ({
    ...product,
    farmer_name: database.users.find((user) => user.user_id === product.farmer_id)?.name || 'কৃষক',
    category_name: getCategoryName(product.category_id),
});

const presentOrder = (database, order) => {
    const product = database.products.find((item) => item.product_id === order.product_id);
    return {
        ...order,
        product_name: product?.name || 'মুছে ফেলা পণ্য',
        farmer_name: database.users.find((user) => user.user_id === product?.farmer_id)?.name || 'কৃষক',
        buyer_name: database.users.find((user) => user.user_id === order.buyer_id)?.name || 'ক্রেতা',
    };
};

const getStats = (database) => {
    const confirmedOrders = database.orders.filter((order) => order.status === 'confirmed');
    const totalRevenue = confirmedOrders.reduce((sum, order) => sum + Number(order.total_price), 0);
    const totalPlatformIncome = confirmedOrders.reduce((sum, order) => sum + Number(order.platform_fee), 0);
    const totalFarmerEarnings = confirmedOrders.reduce((sum, order) => sum + Number(order.farmer_amount), 0);

    return {
        total_farmers: database.users.filter((user) => user.role === 'farmer').length,
        total_buyers: database.users.filter((user) => user.role === 'buyer').length,
        total_products: database.products.length,
        total_orders: database.orders.length,
        total_revenue: totalRevenue,
        total_platform_income: totalPlatformIncome,
        total_farmer_earnings: totalFarmerEarnings,
    };
};

const getProfile = (database, user) => {
    const base = {
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        created_at: user.created_at,
    };

    if (user.role === 'buyer') {
        const orders = database.orders
            .filter((order) => order.buyer_id === user.user_id)
            .sort((first, second) => new Date(second.order_date) - new Date(first.order_date))
            .map((order) => presentOrder(database, order));
        return {
            ...base,
            total_orders: orders.length,
            total_spent: orders.reduce((sum, order) => sum + Number(order.total_price), 0),
            recent_orders: orders.slice(0, 5),
        };
    }

    const products = database.products
        .filter((product) => product.farmer_id === user.user_id)
        .sort((first, second) => new Date(second.created_at) - new Date(first.created_at));
    const orders = database.orders.filter((order) =>
        database.products.some((product) => product.product_id === order.product_id && product.farmer_id === user.user_id)
    );

    return {
        ...base,
        total_products: products.length,
        total_orders: orders.length,
        total_earnings: orders
            .filter((order) => order.status === 'confirmed')
            .reduce((sum, order) => sum + Number(order.farmer_amount), 0),
        recent_products: products.slice(0, 5).map((product) => ({
            ...product,
            category_name: getCategoryName(product.category_id),
        })),
    };
};

const mockFetch = async (input, options = {}) => {
    const url = new URL(input, window.location.origin);
    const path = url.pathname.replace(/\/$/, '') || '/';
    const method = (options.method || 'GET').toUpperCase();
    const body = getBody(options);
    const database = readDatabase();
    const userId = getUserId(options);
    const currentUser = database.users.find((user) => user.user_id === userId);

    if (method === 'POST' && path === '/api/auth/login') {
        const user = database.users.find((item) => item.email.toLowerCase() === String(body.email || '').toLowerCase());
        if (!user) return respond({ message: 'User not found. Use an email from fake.json.' }, 400);
        if (!body.password) return respond({ message: 'Password is required.' }, 400);
        if (user.status === 'pending') return respond({ message: 'Wait for admin approval.' }, 403);
        return respond({
            message: 'Login successful!',
            token: `mock-jwt-token-user-${user.user_id}`,
            user: { id: user.user_id, name: user.name, email: user.email, role: user.role },
        });
    }

    if (method === 'POST' && path === '/api/auth/signup') {
        if (database.users.some((user) => user.email.toLowerCase() === String(body.email || '').toLowerCase())) {
            return respond({ message: 'Email already exists!' }, 400);
        }
        const userIdNext = Math.max(0, ...database.users.map((user) => user.user_id)) + 1;
        const user = {
            user_id: userIdNext,
            name: body.name || 'নতুন ব্যবহারকারী',
            email: body.email || '',
            role: body.role === 'farmer' ? 'farmer' : 'buyer',
            status: body.role === 'farmer' ? 'pending' : 'approved',
            created_at: new Date().toISOString(),
        };
        database.users.push(user);
        saveDatabase(database);
        return respond({ message: 'Signup successful!', userId: userIdNext }, 201);
    }

    if (method === 'GET' && (path === '/api/products' || path === '/api/products/search')) {
        const search = (url.searchParams.get('name') || '').toLocaleLowerCase();
        const categoryId = url.searchParams.get('category_id');
        const sort = url.searchParams.get('sort');
        let products = database.products
            .filter((product) => Number(product.quantity) > 0)
            .filter((product) => !categoryId || product.category_id === Number(categoryId))
            .filter((product) => !search || product.name.toLocaleLowerCase().includes(search))
            .map((product) => presentProduct(database, product));
        if (sort === 'low') products.sort((first, second) => first.price - second.price);
        if (sort === 'high') products.sort((first, second) => second.price - first.price);
        return respond(products);
    }

    if (method === 'GET' && path === '/api/products/my-products') {
        return respond(database.products
            .filter((product) => product.farmer_id === userId)
            .map((product) => presentProduct(database, product)));
    }

    if (method === 'GET' && path === '/api/products/stats') {
        const products = database.products.filter((product) => product.farmer_id === userId);
        const orders = database.orders.filter((order) =>
            products.some((product) => product.product_id === order.product_id)
        );
        const confirmedOrders = orders.filter((order) => order.status === 'confirmed');
        return respond({
            total_products: products.length,
            total_earnings: confirmedOrders.reduce((sum, order) => sum + Number(order.farmer_amount), 0),
            avg_price: products.length
                ? products.reduce((sum, product) => sum + Number(product.price), 0) / products.length
                : 0,
            total_platform_fee: confirmedOrders.reduce((sum, order) => sum + Number(order.platform_fee), 0),
        });
    }

    if (method === 'POST' && path === '/api/products/add') {
        if (!currentUser || currentUser.role !== 'farmer') return respond({ message: 'Farmer login required.' }, 403);
        const product = {
            product_id: Math.max(0, ...database.products.map((item) => item.product_id)) + 1,
            farmer_id: userId,
            name: body.name,
            price: Number(body.price),
            quantity: Number(body.quantity),
            category_id: Number(body.category_id),
            image_url: body.image_url || null,
            created_at: new Date().toISOString(),
        };
        database.products.push(product);
        saveDatabase(database);
        return respond({ message: 'Product added successfully!', product_id: product.product_id }, 201);
    }

    const productDelete = path.match(/^\/api\/(?:products|admin\/products)\/delete\/(\d+)$/);
    if (method === 'DELETE' && productDelete) {
        const productId = Number(productDelete[1]);
        database.products = database.products.filter((product) => product.product_id !== productId);
        saveDatabase(database);
        return respond({ message: 'Product deleted successfully!' });
    }

    if (method === 'POST' && path === '/api/orders/place') {
        const product = database.products.find((item) => item.product_id === Number(body.product_id));
        const quantity = Number(body.quantity);
        if (!currentUser || currentUser.role !== 'buyer') return respond({ message: 'Buyer login required.' }, 403);
        if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > product.quantity) {
            return respond({ message: 'Invalid product quantity.' }, 400);
        }
        const totalPrice = Number(product.price) * quantity;
        const order = {
            order_id: Math.max(0, ...database.orders.map((item) => item.order_id)) + 1,
            buyer_id: userId,
            product_id: product.product_id,
            quantity,
            total_price: totalPrice,
            platform_fee: Number((totalPrice * 0.1).toFixed(2)),
            farmer_amount: Number((totalPrice * 0.9).toFixed(2)),
            status: 'pending',
            order_date: new Date().toISOString(),
        };
        product.quantity -= quantity;
        database.orders.push(order);
        saveDatabase(database);
        return respond({ message: 'Order placed successfully!', total_price: totalPrice }, 201);
    }

    if (method === 'GET' && path === '/api/orders/my-orders') {
        return respond(database.orders
            .filter((order) => order.buyer_id === userId)
            .sort((first, second) => new Date(second.order_date) - new Date(first.order_date))
            .map((order) => presentOrder(database, order)));
    }

    if (method === 'GET' && path === '/api/orders/farmer-orders') {
        const productIds = new Set(database.products
            .filter((product) => product.farmer_id === userId)
            .map((product) => product.product_id));
        return respond(database.orders
            .filter((order) => productIds.has(order.product_id))
            .sort((first, second) => new Date(second.order_date) - new Date(first.order_date))
            .map((order) => presentOrder(database, order)));
    }

    const orderIdMatch = path.match(/^\/api\/orders\/(cancel|confirm)\/(\d+)$/);
    if (method === 'PUT' && orderIdMatch) {
        const [, action, rawOrderId] = orderIdMatch;
        const order = database.orders.find((item) => item.order_id === Number(rawOrderId));
        if (!order || order.status !== 'pending') return respond({ message: 'Order is no longer pending.' }, 400);
        if (action === 'cancel') {
            if (order.buyer_id !== userId) return respond({ message: 'Order not found.' }, 404);
            order.status = 'cancelled';
            const product = database.products.find((item) => item.product_id === order.product_id);
            if (product) product.quantity += order.quantity;
        } else {
            const product = database.products.find((item) => item.product_id === order.product_id);
            if (!currentUser || currentUser.role !== 'farmer' || product?.farmer_id !== userId) {
                return respond({ message: 'Order not found.' }, 404);
            }
            order.status = 'confirmed';
        }
        saveDatabase(database);
        return respond({ message: `Order ${action}ed successfully!` });
    }

    if (method === 'GET' && path === '/api/orders/stats') return respond(getStats(database));
    if (method === 'GET' && path === '/api/orders/all') {
        return respond(database.orders.map((order) => presentOrder(database, order)));
    }

    if (method === 'GET' && path === '/api/admin/farmers') {
        return respond(database.users.filter((user) => user.role === 'farmer'));
    }

    const farmerAction = path.match(/^\/api\/admin\/farmers\/(approve|delete)\/(\d+)$/);
    if (farmerAction && method === (farmerAction[1] === 'approve' ? 'PUT' : 'DELETE')) {
        const [, action, rawFarmerId] = farmerAction;
        const farmerId = Number(rawFarmerId);
        if (action === 'approve') {
            const farmer = database.users.find((user) => user.user_id === farmerId && user.role === 'farmer');
            if (!farmer) return respond({ message: 'Farmer not found.' }, 404);
            farmer.status = 'approved';
        } else {
            database.users = database.users.filter((user) => user.user_id !== farmerId);
            database.products = database.products.filter((product) => product.farmer_id !== farmerId);
        }
        saveDatabase(database);
        return respond({ message: `Farmer ${action} successful!` });
    }

    if (method === 'GET' && path === '/api/admin/products') {
        return respond(database.products.map((product) => presentProduct(database, product)));
    }

    if (method === 'GET' && path === '/api/profile') {
        if (!currentUser) return respond({ message: 'Login required.' }, 401);
        return respond(getProfile(database, currentUser));
    }

    return respond({ message: `No demo handler for ${method} ${path}` }, 404);
};

export default mockFetch;