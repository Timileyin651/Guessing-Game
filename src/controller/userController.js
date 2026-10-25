const userService = require('../services/user.service');

const create = async (req,res,next) => {
    try {
        const user = await userService.createUser(req.body);
        res.status(201).json({ successs: true, data: user})
    } catch (error) {
        next(error)
        
    }
}

const list 