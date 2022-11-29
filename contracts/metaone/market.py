from pyteal import *
from pyteal.ast.bytes import Bytes
from pyteal.ast.expr import Expr
from pyteal_helpers import program


# globals
global_plat_admin = Bytes("plat_admin")  # byteslice
global_currency = Bytes("currency")   # uint64
global_rate_denominator = Bytes("set_rate_denominator")   # uint64
global_rate_numerator = Bytes("set_rate_numerator")   # uint64
global_plat_income = Bytes("plat_income")  # byteslice

# locals of senders
local_item_index = Bytes("item_index")  # uint64
local_time_unit = Bytes("time_unit")  # uint64
local_max_time_units = Bytes("max_time_units")  # uint64
local_min_time_units = Bytes("min_time_units")  # uint64
local_price_per_unit = Bytes("price_per_unit")  # uint64
local_last_valid_time = Bytes("last_valid_time")  # uint64
local_is_extendable = Bytes("is_extendable")    # uint64
local_state = Bytes("state")  # uint64 0：init, 1: available for lease 2: occupied by user 3: idle  
local_income = Bytes("income")    # uint64
local_user_account = Bytes("user_account")    # byteslice

# local_dbg = Bytes("dbg")    # uint64

#operations
op_set_fee = Bytes("set_fee")  
op_set_admin = Bytes("set_admin") 
op_withdraw_flat_fund = Bytes("withdraw_flat_fund") 
op_offer = Bytes("offer") 
op_callback = Bytes("callback") 
op_collect = Bytes("collect") 
op_rent = Bytes("rent")

is_admin = Txn.sender() == App.globalGet(global_plat_admin)
is_empty_admin = App.globalGet(global_plat_admin) == Bytes("")

is_local_uninit = App.localGet(Txn.sender(), local_state) == Int(0)
is_local_available = App.localGet(Txn.sender(), local_state) == Int(1)
is_local_occupied = App.localGet(Txn.sender(), local_state) == Int(2)
is_local_idle = App.localGet(Txn.sender(), local_state) == Int(3)
is_local_extendable = App.localGet(Txn.sender(), local_is_extendable) != Int(0)
is_local_timeout = Global.latest_timestamp() > App.localGet(Txn.sender(), local_last_valid_time)
is_local_none_rents_left = App.localGet(Txn.sender(), local_income) == Int(0)

OPTIN_MIN_BALANCE=Int(100_000)

def approval():

    @Subroutine(TealType.none)
    def reset():
        return Seq(
            App.globalPut(global_plat_admin,  Bytes("")),
            App.globalPut(global_currency, Int(0)),
            App.globalPut(global_rate_denominator, Int(0)),
            App.globalPut(global_rate_numerator, Int(0)),
        )

    @Subroutine(TealType.none)
    def local_reset(account: Expr):
        return Seq( 
            App.localPut(account, local_item_index, Int(0)),
            App.localPut(account, local_time_unit, Int(0)),
            App.localPut(account, local_max_time_units, Int(0)),
            App.localPut(account, local_min_time_units, Int(0)),
            App.localPut(account, local_price_per_unit, Int(0)),
            App.localPut(account, local_last_valid_time, Int(0)),
            App.localPut(account, local_is_extendable, Int(0)),
            App.localPut(account, local_income, Int(0)),
            App.localPut(account, local_state, Int(0)),
            App.localPut(account, local_user_account, Bytes("")),
        )

    @Subroutine(TealType.none)
    def set_admin():
        return Seq(
            # basic sanity checks
            program.check_self(
                group_size=Int(1),
                group_index=Int(0),
            ),
            program.check_rekey_zero(1),
            If(Or(
                is_empty_admin,
                is_admin,
            ))
            .Then(
                App.globalPut(global_plat_admin, Txn.accounts[1]),
            ).Else(
                Reject(),
            )
        )

    @Subroutine(TealType.none)
    def set_fee(currency: Expr,denominator: Expr,numerator: Expr):
        return Seq(
            # basic sanity checks
            program.check_self(
                group_size=Int(1),
                group_index=Int(0),
            ),
            program.check_rekey_zero(1),

            Assert(is_admin),
            Assert(denominator != Int(0)),
            Assert(currency == Txn.assets[0]),

            App.globalPut(global_currency, currency),
            App.globalPut(global_rate_denominator, denominator),
            App.globalPut(global_rate_numerator, numerator),

            InnerTxnBuilder.Begin(),
            InnerTxnBuilder.SetFields(
                {
                    TxnField.type_enum: TxnType.AssetTransfer,
                    TxnField.xfer_asset: Txn.assets[0],
                    TxnField.asset_amount: Int(0),
                    TxnField.fee: Int(0),
                    TxnField.asset_receiver: Global.current_application_address(),
                }
            ),
            InnerTxnBuilder.Submit(), 
        )

    @Subroutine(TealType.none)
    def withdraw_plat_fund(amount:Expr):
        s_plat_income = ScratchVar(TealType.uint64)
        return Seq(
            # basic sanity checks
            program.check_self(
                group_size=Int(1),
                group_index=Int(0),
            ),
            program.check_rekey_zero(1),

            # validation of rents type, authority and amount
            Assert(App.globalGet(global_currency) == Txn.assets[0]),
            Assert(App.globalGet(global_plat_income) >= amount),
            Assert(is_admin),

            InnerTxnBuilder.Begin(),
            InnerTxnBuilder.SetFields(
                {
                    TxnField.type_enum: TxnType.AssetTransfer,
                    TxnField.xfer_asset: Txn.assets[0],
                    TxnField.asset_amount: amount,
                    TxnField.fee: Int(0),
                    TxnField.asset_receiver: Txn.sender(),
                }
            ),
            InnerTxnBuilder.Submit(), 

            # make rents accounts
            s_plat_income.store(Minus(
                App.globalGet(global_plat_income),
                amount,
            )),
            App.globalPut(global_plat_income, s_plat_income.load()),
        )

    @Subroutine(TealType.none)
    def offer(asset_id: Expr, time_unit: Expr, max_time_units: Expr, min_time_units: Expr, price: Expr, extendable: Expr):
        asset_holding = AssetHolding.balance(
            Global.current_application_address(), asset_id
        )
        return Seq(
            # time and state parameters check
            Assert(max_time_units > min_time_units),
            Assert(time_unit > Int(0)),

            If(And(is_local_occupied, is_local_timeout))
            .Then(Seq(
                App.localPut(Txn.sender(), local_user_account, Bytes("")),
                If(is_local_extendable)
                .Then(
                    App.localPut(Txn.sender(), local_state, Int(1))
                )
                .Else(
                    App.localPut(Txn.sender(), local_state, Int(3))
                )
            )),

            If(is_local_uninit)
            .Then(
                Seq(
                    # basic sanity checks
                    program.check_self(
                        group_size=Int(3),
                        group_index=Int(1),
                    ),
                    program.check_rekey_zero(3),

                    # check the deposit of algos for optin
                    Assert(Gtxn[0].type_enum() == TxnType.Payment), 
                    Assert(Gtxn[0].amount() == OPTIN_MIN_BALANCE), 
                    Assert(Gtxn[0].receiver() == Global.current_application_address()), 

                    # check asset for lease  
                    Assert(asset_id == Txn.assets[0]),
                    Assert(Gtxn[2].type_enum() == TxnType.AssetTransfer), 
                    Assert(Gtxn[2].xfer_asset() == asset_id), 
                    Assert(Gtxn[2].asset_amount() == Int(1)), 
                    Assert(Gtxn[2].sender() == Txn.sender()), 
                    Assert(Gtxn[2].asset_receiver() ==  Global.current_application_address()), 
                    Assert(Gtxn[2].asset_close_to() ==  Global.zero_address()),     

                    # opt in asset for lease
                    InnerTxnBuilder.Begin(),
                    InnerTxnBuilder.SetFields(
                        {
                            TxnField.type_enum: TxnType.AssetTransfer,
                            TxnField.xfer_asset: Txn.assets[0],
                            TxnField.asset_amount: Int(0),
                            TxnField.fee: Int(0),
                            TxnField.asset_receiver: Global.current_application_address(),
                        }
                    ),
                    InnerTxnBuilder.Submit(),   

                    # local state
                    App.localPut(Txn.sender(), local_state, Int(1)),

                    # set locals for offer  
                    App.localPut(Txn.sender(), local_item_index, asset_id),   
                    App.localPut(Txn.sender(), local_time_unit, time_unit),    
                    App.localPut(Txn.sender(), local_max_time_units, max_time_units),    
                    App.localPut(Txn.sender(), local_min_time_units,min_time_units),    
                    App.localPut(Txn.sender(), local_price_per_unit, price),    
                    App.localPut(Txn.sender(), local_is_extendable, extendable), 
                )
            )
            .ElseIf(Or(is_local_available, is_local_idle))
            .Then(
                Seq(
                    # basic sanity checks
                    program.check_self(
                        group_size=Int(1),
                        group_index=Int(0),
                    ),
                    program.check_rekey_zero(1),

                    # check asset for lease  
                    Assert(asset_id == App.localGet(Txn.sender(), local_item_index)),

                    # set locals for offer  
                    App.localPut(Txn.sender(), local_time_unit, time_unit),    
                    App.localPut(Txn.sender(), local_max_time_units, max_time_units),    
                    App.localPut(Txn.sender(), local_min_time_units,min_time_units),    
                    App.localPut(Txn.sender(), local_price_per_unit, price),    
                    App.localPut(Txn.sender(), local_is_extendable, extendable), 

                    If(App.localGet(Txn.sender(), local_state) == Int(3))
                    .Then(
                        App.localPut(Txn.sender(), local_state, Int(1)),
                    ),
                )
            )            
            .Else(
                Reject()
            ),

            asset_holding,
            Assert(asset_holding.hasValue()),
        )

    @Subroutine(TealType.none)
    def callback():
        return Seq(
            # basic sanity checks
            program.check_self(
                group_size=Int(1),
                group_index=Int(0),
            ),
            program.check_rekey_zero(1),

            Assert(App.localGet(Txn.sender(), local_item_index) == Txn.assets[0]),

            # only unused nft can be recalled
            If(And(is_local_occupied, is_local_timeout))
            .Then(Seq(
                App.localPut(Txn.sender(), local_user_account, Bytes("")),
                If(is_local_extendable)
                .Then(
                    App.localPut(Txn.sender(), local_state, Int(1))
                )
                .Else(
                    App.localPut(Txn.sender(), local_state, Int(3))
                )
            )),
            Assert(Or(is_local_available, is_local_idle)),
            
           # all rents must be collected before recalling your nft
            Assert(is_local_none_rents_left),  

            # give back the asset
            InnerTxnBuilder.Begin(),
            InnerTxnBuilder.SetFields(
                {
                    TxnField.type_enum: TxnType.AssetTransfer,
                    TxnField.xfer_asset: Txn.assets[0],
                    # TxnField.asset_amount: Int(0),
                    TxnField.fee: Int(0),
                    TxnField.asset_close_to: Txn.sender(),
                }
            ),
            # give back the optin algos
            InnerTxnBuilder.Next(),
            InnerTxnBuilder.SetFields(
                {
                    TxnField.type_enum: TxnType.Payment,
                    TxnField.amount: OPTIN_MIN_BALANCE,
                    TxnField.fee: Int(0),
                    TxnField.receiver: Txn.sender(),
                }
            ),
            InnerTxnBuilder.Submit(),

            local_reset(Txn.sender()),
        )

    @Subroutine(TealType.none)
    def rent(amount: Expr):
        s_num_of_units = ScratchVar(TealType.uint64) 
        s_duration = ScratchVar(TealType.uint64)   
        s_last_valid = ScratchVar(TealType.uint64)  
        s_income = ScratchVar(TealType.uint64)  
        s_plat_fee = ScratchVar(TealType.uint64)
        return Seq(
            # basic sanity checks
            program.check_self(
                group_size=Int(2),
                group_index=Int(0),
            ),
            program.check_rekey_zero(2), 

            # check if nft is available for lease
            Assert(Or(
                    App.localGet(Txn.accounts[1], local_state) == Int(1),
                    And(App.localGet(Txn.accounts[1], local_state) == Int(2),
                        App.localGet(Txn.accounts[1], local_is_extendable) != Int(0),
                        Global.latest_timestamp() > App.localGet(Txn.accounts[1], local_last_valid_time)
                        ),
                )
            ),

            # check if the rents are being paid
            Assert(Gtxn[1].type_enum() == TxnType.AssetTransfer), 
            Assert(Gtxn[1].xfer_asset() == App.globalGet(global_currency)), 
            Assert(Gtxn[1].asset_amount() == amount), 
            Assert(Gtxn[1].sender() == Txn.sender()), 
            Assert(Gtxn[1].asset_receiver() ==  Global.current_application_address()),     
            Assert(Gtxn[1].asset_close_to() ==  Global.zero_address()),            

            # validation of payment amount and time factors
            Assert(Mod(amount, App.localGet(Txn.accounts[1], local_price_per_unit)) == Int(0)),
            s_num_of_units.store(Div(
                amount,
                App.localGet(Txn.accounts[1], local_price_per_unit),  
            )), 
            Assert(s_num_of_units.load() >= 
                   App.localGet(Txn.accounts[1], local_min_time_units)),   
            Assert(s_num_of_units.load() <= 
                   App.localGet(Txn.accounts[1], local_max_time_units)),

            # calc the last valid time point
            s_duration.store(Mul(
                App.localGet(Txn.accounts[1], local_time_unit),
                s_num_of_units.load(),
            )),
            s_last_valid.store(Add(
                s_duration.load(),
                Global.latest_timestamp(),
            )),

            # calc the plat fee and  lender's income,then make accounts
            s_plat_fee.store(Mul(
                App.globalGet(global_rate_numerator),
                amount,
            )),

            s_plat_fee.store(Div(
                s_plat_fee.load(),
                App.globalGet(global_rate_denominator),
            )),
            s_income.store(Minus(
                amount,
                s_plat_fee.load(),
            )),

            s_plat_fee.store(Add(
                App.globalGet(global_plat_income),
                s_plat_fee.load(),
            )),
            App.globalPut(global_plat_income, s_plat_fee.load()),

            s_income.store(Add(
                App.localGet(Txn.accounts[1], local_income),
                amount,
            )),
            App.localPut(Txn.accounts[1], local_income, s_income.load()),

            App.localPut(Txn.accounts[1], local_last_valid_time, s_last_valid.load()),
            App.localPut(Txn.accounts[1], local_user_account, Txn.sender()),
            App.localPut(Txn.accounts[1], local_state, Int(2)),
        )

    @Subroutine(TealType.none)
    def collect(amount:Expr):
        s_income = ScratchVar(TealType.uint64)
        return Seq(
            # basic sanity checks
            program.check_self(
                group_size=Int(1),
                group_index=Int(0),
            ),
            program.check_rekey_zero(1),

            If(And(is_local_occupied, is_local_timeout))
            .Then(Seq(
                App.localPut(Txn.sender(), local_user_account, Bytes("")),
                If(is_local_extendable)
                .Then(
                    App.localPut(Txn.sender(), local_state, Int(1))
                )
                .Else(
                    App.localPut(Txn.sender(), local_state, Int(3))
                )
            )),

            # validation of rents type and amount
            Assert(App.globalGet(global_currency) == Txn.assets[0]),
            Assert(App.localGet(Txn.sender(), local_income) >= amount),

            InnerTxnBuilder.Begin(),
            InnerTxnBuilder.SetFields(
                {
                    TxnField.type_enum: TxnType.AssetTransfer,
                    TxnField.xfer_asset: Txn.assets[0],
                    TxnField.asset_amount: amount,
                    TxnField.fee: Int(0),
                    TxnField.asset_receiver: Txn.sender(),
                }
            ),
            InnerTxnBuilder.Submit(), 

            # make rents accounts
            s_income.store(Minus(
                App.localGet(Txn.sender(), local_income),
                amount,
            )),
            App.localPut(Txn.sender(), local_income, s_income.load()),
        )

    return program.event(
        init=Seq(
            reset(),
            If(Txn.application_args[0] == op_set_admin).Then(set_admin()),
            Approve(),
        ),
        opt_in=Seq(
            # local_reset(Txn.sender()),
            Approve(),
        ),
        no_op=Seq(
            Cond(
                [Txn.application_args[0] == op_set_admin, set_admin()],
                [Txn.application_args[0] == op_set_fee, 
                    set_fee(Btoi(Txn.application_args[1]), 
                            Btoi(Txn.application_args[2]),
                            Btoi(Txn.application_args[3]))],
                [Txn.application_args[0] == op_offer, 
                    offer(Btoi(Txn.application_args[1]), 
                            Btoi(Txn.application_args[2]),
                            Btoi(Txn.application_args[3]),
                            Btoi(Txn.application_args[4]),
                            Btoi(Txn.application_args[5]),
                            Btoi(Txn.application_args[6]),
                            )],
                [Txn.application_args[0] == op_callback, 
                    callback()],
                [Txn.application_args[0] == op_rent, 
                    rent(Btoi(Txn.application_args[1]))],
                [Txn.application_args[0] == op_collect, 
                    collect(Btoi(Txn.application_args[1]))],
                [Txn.application_args[0] == op_withdraw_flat_fund, 
                    withdraw_plat_fund(Btoi(Txn.application_args[1]))],
            ),
            Approve(),
        ),
        close_out=Seq(
            Assert(App.localGet(Txn.sender(), local_income) == Int(0)), 
            Assert(App.localGet(Txn.sender(), local_item_index) == Int(0)), 
            Approve(),
        ),
    )

def clear():
    return Seq(
        Reject(),
    )
    
