function validate(schema, property='body'){
    return(req,res,next)=> {
        const { error, value} = schema.validate(req[property], {
            aboutEarly:false,
            stripUnknown: true
        });
        if(error){
            const message = error.details.map((d) => d.message).join(', ');
            return res.status(422).json({success:true,message})
        }

        req[property] = value;
        next()
    }
}

module.exports = validate