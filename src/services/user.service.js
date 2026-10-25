const User = require('../model/user');
const AppError = require('../utils/AppError');

async function createUser(data) {
    try {
        const user = await User.create(data);
        return user
    } catch (error) {
        if(error.code === 11000){
            throw new AppError('User already exists', 409);
        }
        throw new AppError('Oops something went wrong',404)
    }
}

async function listUsers(){
    const allUsers = await User.find().sort({ createdAt: -1})
    return allUsers;
}



module.exports = {
    createUser,
    listUsers
};