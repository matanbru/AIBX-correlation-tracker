# MongoDB Atlas Setup (Cloud Database)

## Quick 5-Minute Setup:

### 1. Create Account
- Go to https://www.mongodb.com/cloud/atlas
- Click "Sign Up with Email"
- Fill in details and verify email

### 2. Create Cluster
- Click "Create a Deployment"
- Select "Free" tier
- Choose your region (closest to you)
- Click "Create"

### 3. Get Connection String
- Go to "Databases" → Your Cluster
- Click "Connect"
- Select "Drivers"
- Copy the connection string
- It looks like: `mongodb+srv://username:password@cluster.mongodb.net/ai-stock-tracker`

### 4. Update Your .env File
Edit: `c:\Users\student\Desktop\Ideas\ai-stock-tracker\backend\.env`

Replace:
```
MONGODB_URI=mongodb://localhost:27017/ai-stock-tracker
```

With your copied string:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ai-stock-tracker
```

### 5. Create Database User (if needed)
- In Atlas dashboard, go to "Database Access"
- Click "Add New Database User"
- Set username and password
- Use same credentials in connection string

That's it! Your backend will connect to MongoDB Atlas in the cloud.

---

## Alternative: Install Local MongoDB

If you prefer local MongoDB:

### Windows:
1. Download: https://www.mongodb.com/try/download/community
2. Run installer with default settings
3. MongoDB will run as a service automatically

### Then run:
```powershell
mongod
```

You should see: `waiting for connections on port 27017`

